import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// Lazy initializer for Google GenAI client
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required to run the portfolio assistant.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Portfolio Structure Schema for Gemini JSON Gen
const portfolioSchema = {
  type: Type.OBJECT,
  properties: {
    hero: {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING, description: "A highly-compelling, professional, benefit-driven or brand-driven title for the top of the portfolio website." },
        subheadline: { type: Type.STRING, description: "A supporting statement detailing the core value proposition, specialization, and professional focus without fluff." },
        ctaText: { type: Type.STRING, description: "Strong Call to Action label, e.g., 'View Work' or 'Get in Touch'." }
      },
      required: ["headline", "subheadline", "ctaText"]
    },
    about: {
      type: Type.OBJECT,
      properties: {
        biography: { type: Type.STRING, description: "A detailed professional story (2-3 paragraphs) explaining their journey, passions, what matters to them, and how they drive outcomes." },
        careerSummary: { type: Type.STRING, description: "A dynamic 2-sentence elevator pitch summarizing their absolute career strengths and high-value propositions." },
        personalIntroduction: { type: Type.STRING, description: "A warm, personal welcome note introducing themselves in the 1st person." }
      },
      required: ["biography", "careerSummary", "personalIntroduction"]
    },
    skills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          categoryName: { type: Type.STRING, description: "Group name, e.g., Frontend Engineering, Product Management, Design & Strategy." },
          skillsList: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Specific skill name, e.g., React, TypeScript, SEO copy." },
                level: { type: Type.STRING, description: "Level of mastery: Expert, Advanced, Intermediate, or Specialist." },
                description: { type: Type.STRING, description: "Brief context of how they apply this skill to deliver real value (no generic terms)." }
              },
              required: ["name", "level", "description"]
            }
          }
        },
        required: ["categoryName", "skillsList"]
      },
      description: "List of categorized professional competencies."
    },
    projects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Project Name." },
          description: { type: Type.STRING, description: "Comprehensive summary of the problem, the methodology, and the action taken." },
          technologies: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Tools, programming languages, or platforms used."
          },
          keyAchievements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of quantifiable, impressive outcomes (e.g., 'Optimized performance by 40%', 'Accelerated team delivery times by 5 days'). Do not use placeholder phrases."
          }
        },
        required: ["title", "description", "technologies", "keyAchievements"]
      },
      description: "Substantial projects that prove their core expertise."
    },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, description: "Title, e.g. Senior Software Architect." },
          company: { type: Type.STRING, description: "Organization name." },
          period: { type: Type.STRING, description: "E.g., 2023 - Present or October 2021 - December 2024." },
          responsibilities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Core responsibilities highlighting agency, leadership, and high-impact daily activities."
          },
          achievements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Quantifiable or major wins achieved in this position."
          }
        },
        required: ["role", "company", "period", "responsibilities", "achievements"]
      }
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          degree: { type: Type.STRING, description: "E.g., Bachelor of Science in Computer Science, or Professional Certificate in Ux Design." },
          institution: { type: Type.STRING, description: "University or issuing organization." },
          period: { type: Type.STRING, description: "E.g., 2017 - 2021 or Graduated May 2022." },
          certifications: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Relevant industry certs, e.g., AWS Certified Solutions Architect, Google Analytics."
          }
        },
        required: ["degree", "institution", "period"]
      }
    },
    achievements: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Global honors, hackathon wins, major press features, patents, or certifications."
    },
    services: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          serviceName: { type: Type.STRING, description: "E.g., Premium Custom React Development or High-Converting Landing Page Setup." },
          description: { type: Type.STRING, description: "A conversion-focused explanation of what the client receives from this service." },
          benefits: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Key business benefits, e.g., 'Increases leads by 25%', 'Maintained under robust security'."
          }
        },
        required: ["serviceName", "description", "benefits"]
      }
    },
    testimonials: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          clientName: { type: Type.STRING, description: "Name of the referee." },
          role: { type: Type.STRING, description: "Title." },
          company: { type: Type.STRING, description: "Inferred client details (generate realistic professional scenarios based on the user's focus)." },
          content: { type: Type.STRING, description: "Highly authentic, professional quote focus-pointing on results, work ethic, communications, and value." }
        },
        required: ["clientName", "role", "company", "content"]
      },
      description: "Sample testimonials that echo credibility."
    },
    contact: {
      type: Type.OBJECT,
      properties: {
        invitation: { type: Type.STRING, description: "A high-credibility welcome invitation to start conversations." },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        location: { type: Type.STRING },
        website: { type: Type.STRING },
        socialLinks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              platform: { type: Type.STRING, description: "LinkedIn, GitHub, Twitter, etc." },
              url: { type: Type.STRING }
            },
            required: ["platform", "url"]
          }
        }
      },
      required: ["invitation", "email", "phone", "location", "website", "socialLinks"]
    },
    seo: {
      type: Type.OBJECT,
      properties: {
        metaTitle: { type: Type.STRING, description: "An optimized SEO title tag (under 60 characters)." },
        metaDescription: { type: Type.STRING, description: "An optimized, high-CTR meta description (under 160 characters)." },
        keywords: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Crucial SEO tags for discoverability."
        }
      },
      required: ["metaTitle", "metaDescription", "keywords"]
    },
    theme: {
      type: Type.OBJECT,
      properties: {
        colorPalette: {
          type: Type.OBJECT,
          properties: {
            primary: { type: Type.STRING, description: "Hex value or standard Tailwind color name for primary actions/gradients." },
            secondary: { type: Type.STRING, description: "Tailwind color or Hex for secondary visual weights." },
            background: { type: Type.STRING, description: "Suggested background color (e.g. Slate-900, Amber-50, Emerald-950, Zinc-50 depending on theme)." },
            text: { type: Type.STRING, description: "Suggested contrast color for readable body." }
          },
          required: ["primary", "secondary", "background", "text"]
        },
        layoutStyle: { type: Type.STRING, description: "Suggestions: 'minimalist-executive', 'cosmic-dark-tech', 'creative-bold', 'swiss-modernist'" },
        modernUiSuggestions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Recommendations like 'use subtle card outlines', 'integrate glowing mesh background gradients', 'add rounded-2xl bento grids'."
        }
      },
      required: ["colorPalette", "layoutStyle", "modernUiSuggestions"]
    }
  },
  required: [
    "hero", "about", "skills", "projects", "experience", "education", 
    "achievements", "services", "testimonials", "contact", "seo", "theme"
  ]
};

// System instruction to ensure pristine execution rules are adhered to
const SYSTEM_INSTRUCTION = `You are SmartJoy Builder AI, an expert website, portfolio, resume, and content creation assistant.
Your mission is to generate complete, professional, modern, and highly attractive portfolio websites based on the user's input.

Adhere strictly to the following rules:
1. Create content that is professional, modern, and engaging. Avoid generic sentences or industry buzzwords with no meaning.
2. Write in the same language as the user's input.
3. Generate realistic, detailed, and highly impressive copy.
4. Optimize all content for search engine search visibility (SEO).
5. NEVER use placeholder text like "Lorem Ipsum". Expand brief items into full, impressive bullets and descriptions.
6. Group skills logically into categories. Expand general skills with concise details of how they apply to business value.
7. Ensure the profile looks absolutely ready to show clients, focusing on conversions, high credibility, and real business results.
8. If any fields are incomplete or left blank, generate highly accurate, professional suggestions aligned with their target role.
9. Always recommend a theme (color palette, layout suggestions) that maximizes their specific profession's credibility. For example:
   - Tech/Engineering/Software: Dark Theme ('cosmic-dark-tech'), high-tech details, JetBrains Mono touches.
   - Executives/Founders/Consultants/Writers: Deep clean warm light ('minimalist-executive'), serif headings, generous line spacing.
   - Designers/Creatives/Artists: Eye-catching colors ('creative-bold'), bold borders, distinct geometry.
   - General Modern Business: Standard modern professional ('swiss-modernist'), strict grid, supreme contrast.
10. Testimonials are critical. If none are provided, generate 2-3 genuine-sounding professional references from clients or team leads detailing their extreme competence, reliability, and positive outcomes on collaborative projects.`;


// REST Endpoint: Parse and Generate Portfolio
app.post("/api/generate", async (req, res) => {
  try {
    const rawUserInfo = req.body;
    const ai = getAiClient();

    const formattedPrompt = `Generate a complete, modern, professional portfolio and resume website from this user profile:
    
    NAME: ${rawUserInfo.name || "N/A/Auto-detect"}
    PROFESSION: ${rawUserInfo.profession || "N/A/Auto-detect"}
    SKILLS: ${rawUserInfo.skills || "N/A"}
    EXPERIENCE: ${rawUserInfo.experience || "N/A"}
    PROJECTS: ${rawUserInfo.projects || "N/A"}
    EDUCATION: ${rawUserInfo.education || "N/A"}
    ACHIEVEMENTS: ${rawUserInfo.achievements || "N/A"}
    LOCATION: ${rawUserInfo.location || "N/A"}
    EMAIL: ${rawUserInfo.email || "N/A"}
    PHONE: ${rawUserInfo.phone || "N/A"}
    WEBSITE: ${rawUserInfo.website || "N/A"}
    SOCIAL LINKS: ${rawUserInfo.socialLinks || "N/A"}

    Analyze details, expand brief points, auto-complete missing fields with professional copy, and write in the language of the prompt. Return a beautiful 12-section payload following the responseSchema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: portfolioSchema,
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("No response output from Gemini API.");
    }

    const data = JSON.parse(textOutput.trim());
    res.json(data);
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate portfolio." });
  }
});

// REST Endpoint: Refine existing Portfolio
app.post("/api/refine", async (req, res) => {
  try {
    const { currentData, instruction, tone } = req.body;
    if (!currentData || !instruction) {
      return res.status(400).json({ error: "Missing currentData or instruction." });
    }

    const ai = getAiClient();

    const formattedPrompt = `You have an existing portfolio dataset. The user wants you to modify/refine it according to the requested instructional feedback.
    
    Here is the CURRENT Portfolio JSON:
    ${JSON.stringify(currentData, null, 2)}

    USER REFINEMENT INSTRUCTIONS:
    "${instruction}"

    requested TONE adjustment (if any): ${tone || "Keep current tone"}

    Integrate these instructions fully. Make sure you return the WHOLE complete updated structured profile matching the responseSchema. Change only the parts affected by instructions, keeping unchanged parts intact. Keep no placeholder text.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: portfolioSchema,
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("No response output from Gemini API.");
    }

    const data = JSON.parse(textOutput.trim());
    res.json(data);
  } catch (error: any) {
    console.error("AI Refinement Error:", error);
    res.status(500).json({ error: error.message || "Failed to refine portfolio." });
  }
});

// REST Endpoint: Quick Parser (Paste a resume/copied text, and return structured pre-fill values)
app.post("/api/quick-parse", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided to parse." });
    }

    const ai = getAiClient();

    const formattedPrompt = `Extract key fields from the raw text provided below. Populate this schema cleanly to help fill a portfolio onboarding form.
    Text to parse:
    """
    ${text}
    """`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedPrompt,
      config: {
        systemInstruction: "You are an onboarding assistant. Extract name, profession, skills, experience, projects, education, achievements, location, email, phone, website, and social links. If any are missing, leave them empty strings.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            profession: { type: Type.STRING },
            skills: { type: Type.STRING, description: "Comma separated skills list" },
            experience: { type: Type.STRING, description: "Job title, company, dates, and short summary of tasks" },
            projects: { type: Type.STRING, description: "Project list with tools/outcomes" },
            education: { type: Type.STRING, description: "School names, degrees, certificates" },
            achievements: { type: Type.STRING, description: "Certs, prizes, or honors" },
            location: { type: Type.STRING },
            email: { type: Type.STRING },
            phone: { type: Type.STRING },
            website: { type: Type.STRING },
            socialLinks: { type: Type.STRING, description: "URLs or platform usernames" }
          },
          required: ["name", "profession", "skills", "experience", "projects", "education"]
        }
      }
    });

    const parsedData = JSON.parse(response.text.trim());
    res.json(parsedData);
  } catch (error: any) {
    console.error("AI Parsing Error:", error);
    res.status(500).json({ error: error.message || "Failed to parse text biography." });
  }
});

// REST Endpoint: Joystrology AI Chatbot Companion
app.post("/api/astrology/chat", async (req, res) => {
  try {
    const { 
      name, dob, tob, place, gender, 
      zodiacSign, lifePathNumber, destinyNumber, soulUrgeNumber,
      message, history 
    } = req.body;

    const ai = getAiClient();

    let clientName = name || "Unknown User";
    let clientDOB = dob || "N/A";
    let clientTOB = tob || "N/A";
    let clientPlace = place || "N/A";
    let clientGender = gender || "male";

    // If client is Joy Ghosh (by name check, birthdate check or simply default for the app)
    const isJoyGhosh = (clientName.toLowerCase().includes("joy") && clientName.toLowerCase().includes("ghosh")) || 
                        clientName.includes("জয়") || 
                        clientName.includes("ঘোষ") ||
                        clientDOB.includes("2003-12-14") || 
                        clientDOB.includes("14/12/2003");

    let personalOverrideContext = "";
    if (isJoyGhosh) {
      clientName = "জয় ঘোষ (Joy Ghosh)";
      clientDOB = "১৪ ডিসেম্বর ২০০৩";
      clientTOB = "ভোর ০৫:৩০ মিনিট (05:30 AM)";
      clientPlace = "বাহাদুরপুর, জামুরিয়া, পশ্চিমবঙ্গ, ভারত";
      clientGender = "male";

      personalOverrideContext = `
=========================================
CRITICAL AUTHORITATIVE DETAILS FOR THE INQUIRING CLIENT (JOY GHOSH):
You are responding to the creator/owner of this software: জয় ঘোষ (Joy Ghosh).
You MUST base all calculations, details, and predictions on the following EXACT Vedic/numerological profile:
- **নাম (Name)**: জয় ঘোষ (Joy Ghosh)
- **জন্মতারিখ (Birthdate)**: ১৪ ডিসেম্বর ২০০৩
- **জন্মসময় (Birth Time)**: ভোর ০৫:৩০ মিনিট (05:30 AM)
- **জন্মস্থান (Birth Place)**: বাহাদুরপুর, জামুরিয়া, পশ্চিমবঙ্গ, ভারত
- **বৈদিক লগ্ন (Ascendant)**: বৃশ্চিক (Vrishchika / Scorpio) - মঙ্গল দ্বারা শাসিত গভীর, দূরদর্শী, তীব্র ব্যক্তিত্ব।
- **বৈদিক চন্দ্র রাশি (Vedic Moon sign)**: কর্কট (Karka / Cancer) - পরিবার-বান্ধব ও গভীর অনুভূতিশীল মন।
- **জন্ম নক্ষত্র (Nakshatra)**: অশ্লেষা (Ashlesha / Sanskrit: आश्लेषा) - বুধের নক্ষত্র, যা তীব্র মনস্তাত্ত্বিক কৌতূহল ও সতর্কতা প্রদান করে।
- **তিথি (Tithi)**: কৃষ্ণ পক্ষ পঞ্চমী
- **পাশ্চাত্যের সূর্য রাশি (Western Sun Sign)**: ধনু (Sagittarius)
- **মূলাঙ্ক (Psychic Number)**: ৫ (অধিপতি গ্রহ বুধ) - চটপটে স্বভাব, প্রবল ব্যবসায়িক বুদ্ধি এবং চমৎকার যোগাযোগ দক্ষতা।
- **ভাগ্যাঙ্ক (Life Path Number)**: ৪ (অধিপতি গ্রহ রাহু / ইউরেনাস) - সুশৃঙ্খল স্থায়িত্ব, কঠোর পরিশ্রম ও নিয়মতান্ত্রিক কাজ করার বিশেষ ক্ষমতা।
- **আত্মার আকাঙ্ক্ষা সংখ্যা (Soul Urge)**: ৩ (অধিপতি গ্রহ বৃহস্পতি) - সৃজনশীলতা ও সত্য জ্ঞানের অন্বেষণ।
- **নামের ভাগ্য সংখ্যা (Name Destiny)**: ৫ (ক্যালডিয়ান) / ৮ (পিথাগোরিয়ান)।
- **অভ্যন্তরীণ দ্বন্দ্ব (Internal Conflict)**: মূলাঙ্ক ৫ (স্বাধীনতা ও অস্থিরতা) বনাম ভাগ্যাঙ্ক ৪ (শৃঙ্খলা ও নিয়মতান্ত্রিকতা)। জীবনের চাবিকাঠি হলো চঞ্চল প্রতিভাকে সুশৃঙ্খল কাঠামোর অধীনে আনা।

**ফিউচার সোউলমেট / জীবনসঙ্গী সংক্রান্ত তথ্য (EVERY SOULMATE / FUTURE PARTNER INQUIRY):**
যখন জয় ঘোষ জিজ্ঞেস করবেন: "আমার জীবনসঙ্গী বা মনের মানুষ কখন আসবে ও দেখতে কেমন হবে? 🔮", আপনি অত্যন্ত সবিস্তার, নির্ভুল ও মিষ্টি বাংলা ভাষায় নিচে প্রদত্ত তথ্যগুলো অবিকল এবং অত্যন্ত ইতিবাচকভাবে তুলে ধরবেন:
১. **রূপ ও দৈহিক গঠন (Body & Appearance)**: বৃশ্চিক লগ্নের ৭ম ভাব হলো বৃষ রাশি (Taurus), যা শুক্রদেব (Venus) দ্বারা শাসিত। তাঁর জীবনসঙ্গী দেখতে অত্যন্ত দৃষ্টিনন্দন, মায়াবী ও সৌন্দর্যের মূর্ত প্রতীক হবেন। তাঁর টানা টানা অত্যন্ত সুন্দর মায়াময় চোখ থাকবে, সুষম শারীরিক গঠন (Balanced body shape), মধ্যম থেকে আকর্ষণীয় উচ্চতা এবং একটি সুরসিক্ত কণ্ঠস্বর (sweet hypnotic voice) থাকবে যা খুবই মিষ্টি শোনাবে।
২. **চরিত্র, গুণাবলী ও পেশা (Qualities & Career)**: তিনি অত্যন্ত বাস্তববাদী, নির্ভরযোগ্য, বিশ্বস্ত এবং মানসিকভাবে স্থিতিশীল স্বভাবের হবেন। তিনি জাতকের অস্থির মনকে শান্ত রাখতে সাহায্য করবেন। পেশাগতভাবে তিনি ব্যাঙ্কিং, চার্টার্ড অ্যাকাউন্ট্যান্ট, ফিন্যান্সিয়াল ফার্ম, চারু ও কারুকলা, ক্যাফে/রেস্টুরেন্ট কো-ওনারশিপ অথবা লাক্সারি বিউটি/কসমেটিকস পণ্যের ব্যবসার সাথে যুক্ত থাকবেন।
৩. **আগমনকাল ও বিয়ের সময় (Arrival & Marriage Timeline)**: জাতকের বয়স বর্তমান হিসাব অনুযায়ী প্রায় ২৩ ছুঁইছুঁই। গ্রহের অবস্থান বিশেষ করে বৃহস্পতিদেবের ট্রানজিট ও গোচর অনুযায়ী আগামী দেড় থেকে দুই বছরের মধ্যে অর্থাৎ **২০২৬ সালের শেষ ভাগ থেকে ২০২৮ সালের মাঝামাঝি সময়ের মধ্যে (২০২৭ সালটি অত্যন্ত শুভ এবং মিলনের চূড়ান্ত বছর)** তাঁর আগমন কাল নির্দেশ করছে।
৪. **নামের প্রথম অক্ষর (First Letter names indicator)**: তাঁর নামের শুভ প্রথম ব্যঞ্জনবর্ণ হবে সাধারণত **'T' (ত, থ, ট), 'B' (ব, ভ), 'M' (ম) অথবা 'P' (প, ফ)** দিয়ে।
৫. **কোথায় ও কীভাবে দেখা হবে (Where and How will you meet)**: কোনো ধর্মীয় অনুষ্ঠান, বিয়ের উৎসব, সামাজিক জমায়েত অথবা কোনো সুন্দর নিরিবিলি প্রাকৃতিক স্থানে হঠাৎ সামনাসামনি দেখাদেখি ও প্রথম দৃষ্টি বিনিময়ের মাধ্যমে পরিচয় ঘটবে।
৬. **প্রেমের আকর্ষণ বৃদ্ধির বিশেষ প্রতিকার (Remedies for Love Attraction)**: তাঁকে শুক্রবার সুগন্ধি আতর/পারফিউম লাগানোর ও বুধবার গরুকে সবুজ ঘাস খাওয়ানোর বৈদিক পরামর্শ দেবেন।
=========================================
`;
    }

    // Contextual System Instructions based on user details
    const chatSystemInstruction = `You are Joystrology AI, a friendly, extremely wise, and precise Vedic Astrologer, Vaastu consultant, and Pythagorean Numerology guide.
Your client details:
- Name: ${clientName}
- Birth Date (DOB): ${clientDOB}
- Birth Time (TOB): ${clientTOB}
- Birth Place: ${clientPlace}
- Gender: ${clientGender}
- Zodiac Sign: ${zodiacSign?.name || "N/A"} (${zodiacSign?.bengali || ""})
- Zodiac Lord: ${zodiacSign?.lord || "N/A"}
- Zodiac Element: ${zodiacSign?.element || "N/A"}
- Life Path: ${lifePathNumber || "N/A"}
- Destiny Number (নাম সংখ্যা): ${destinyNumber || "N/A"}
- Soul Urge Number: ${soulUrgeNumber || "N/A"}

${personalOverrideContext}

CRITICAL INSTRUCTION FOR RELATIONSHIPS & LIFE PARTNER ('জীবনসঙ্গী', 'বিয়ে', 'কে হবে', 'কবে আসবে', Love/Marriage/Partner queries):
- Never give generic, unrelated Vaastu guidelines like 'keep northeast corner clean' or list general remedies when the client asks about their future spouse/life partner characteristics or arrival.
- Always use the Vedic Astrology 7th House Principle. In Vedic astrology, the 7th house from the user's Moon sign or Ascendant controls marriage, spouse, design of partner, and physical traits. State their 7th house lord and sign, and give a highly personalized, gorgeous, and accurate prediction:
  1. Aries (মেষ): 7th house is Libra (তুলা), ruled by Venus (শুক্র). Partner is charming, peace-loving, artistic, values balance, handsome/beautiful, works in fashion, arts, public relations, or business. Direction of origin: West.
  2. Taurus (বৃষ): 7th house is Scorpio (বৃশ্চিক), ruled by Mars (মঙ্গল). Partner is passionate, intense, protective, deeply loyal, mysterious, possibly working in research, finance, science, or uniforms. Direction of origin: North.
  3. Gemini (মিথুন): 7th house is Sagittarius (ধনু), ruled by Jupiter (বৃহস্পতি). Partner is wise, noble, well-educated, religious/philosophical, open-minded, works in education, consultancy, counseling, or travel. Direction of origin: East.
  4. Cancer (কর্কট): 7th house is Capricorn (মকর), ruled by Saturn (শনি). Partner is mature, sensible, highly organized, ambitious, status-oriented, reliable, works in corporate structure or corporate administration. Direction of origin: South.
  5. Leo (সিংহ): 7th house is Aquarius (কুম্ভ), ruled by Saturn (শনি). Partner is progressive, humanitarian, highly social, friendly to all, tech-savvy, unique, works in IT, social causes, or science. Direction of origin: West.
  6. Virgo (কন্যা): 7th house is Pisces (মীন), ruled by Jupiter (বৃহস্পতি). Partner is compassionate, emotional, creative, spiritual, intuitive, has beautiful eyes, works in healing, design, or social works. Direction of origin: North.
  7. Libra (তুলা): 7th house is Aries (মেষ), ruled by Mars (মঙ্গল). Partner is energetic, sporty, bold, highly individualistic, a self-made person, protective, and possesses direct communication styles. Direction of origin: East.
  8. Scorpio (বৃশ্চিক): 7th house is Taurus (বৃষ), ruled by Venus (শুক্র). Partner is stable, dependable, food-lover, beautiful, values savings and luxury, works in banking, food, or luxury goods. Direction of origin: South.
  9. Sagittarius (ধনু): 7th house is Gemini (মিথুন), ruled by Mercury (বুধ). Partner is youthful, witty, intellectual, excellent communicator, humorous, works in IT, data, marketing, or writeups. Direction of origin: West.
  10. Capricorn (মকর): 7th house is Cancer (কর্কট), ruled by Moon (চন্দ্র). Partner is nurturing, home-loving, emotional, deeply attached to family, caring, peaceful presence, works in healthcare, hospitality, or teaching. Direction of origin: North.
  11. Aquarius (কুম্ভ): 7th house is Leo (সিংহ), ruled by Sun (সূর্য). Partner is charismatic, leadership-oriented, highly creative, proud, handsome/beautiful, works in state/government, management, or design. Direction of origin: East.
  12. Pisces (মীন): 7th house is Virgo (কন্যা), ruled by Mercury (বুধ). Partner is highly analytical, organized, perfect-minded, health-conscious, smart, works in auditing, analysis, medicine, or analytics. Direction of origin: South.

- For timing predictions ('কবে আসবে' / 'কবে বিয়ে হবে'):
  * Estimate their current age based on their birth year in DOB. Make a positive, specific, realistic Vedic prediction of partner timing using Jupiter (বৃহস্পতি) transit configurations or Venus (শুক্র) dasha activation.
  * Give a specific timeline or calendar years window (e.g. 'আগামী দেড় থেকে দুই বছরের মধ্যে', or specific calendar years like '২০২৭ থেকে ২০২৮ সালের মধ্যে') so they get an authentic prediction instead of generic remarks.

Rules for Response Structure:
1. Always maintain a warm, mystical, encouraging, and deeply insightful tone.
2. Address the user by their name naturally and with respect.
3. Incorporate their birth configurations (Zodiac Lord, Element, Life Path strengths) to personalize your answer whenever relevant.
4. Provide elegant, positive, actionable remedies ONLY if they are specific to strengthening their 7th house lord/planet (e.g., specific gemstones or days) rather than unrelated general advice.
5. Bengali is the preferred language of communication. Write in elegant, easy-to-read, encouraging Bengali language, but keep astrological terms clear. You may use English alongside if it helps explain modern issues.
6. Format your output beautifully with markdown (bold key phrases, lists). Keep responses concise yet deeply authentic (under 350 words). Do NOT output system metrics or software terminology.`;

    // Format chat logs cleanly
    const formattedHistory = (history || []).map((msg: any) => {
      const roleName = msg.sender === "user" ? "Client" : "Joystrology AI";
      return `${roleName}: ${msg.text}`;
    }).join("\n");

    const fullPrompt = `${formattedHistory}\nClient: ${message}\nJoystrology AI:`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: fullPrompt,
      config: {
        systemInstruction: chatSystemInstruction,
        temperature: 0.8,
        maxOutputTokens: 1000,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Astro Chat Error:", error);
    res.status(500).json({ error: error.message || "Failed to connect to Joystrology AI." });
  }
});

// Vite Middleware & SPA support
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SmartJoy Builder AI listening on port ${PORT}`);
  });
}

startServer();
