import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { error, info, warn } from 'firebase-functions/logger';
import OpenAI from 'openai';
import { ZodError } from 'zod';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { v4 as uuidv4 } from 'uuid';
try { initializeApp(); } catch (_) {}
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const PLAID_CLIENT_ID = defineSecret("PLAID_CLIENT_ID");
const PLAID_SECRET_KEY_PRODUCTION = defineSecret("PLAID_SECRET_KEY_PRODUCTION");
const PLAID_ENV = defineSecret("PLAID_ENV"); 
const allowedOrigins = ['http://localhost:3210', 'https://doobneek.org'].map(o => o.toLowerCase());
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin.toLowerCase())) {
      callback(null, true);
    } else {
      warn(`Blocked CORS origin: ${origin}`);
      callback(null, false); 
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: true,
  preflightContinue: false, 
  optionsSuccessStatus: 204 
};
export const openaiRefineReceipt = onRequest(
  { secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    const corsHandler = cors(corsOptions);
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") {
        return res.status(204).send('');
      }
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'text' in request body" });
      }
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
      const prompt = `
You are a receipt parser.
Your job is to extract:
{
  destination: string,
  items: array of { category: string, amount: string },
  tax: number,
  total: number,
  adjustedTipWarning: boolean
}
**Rules**:
- Each item must have a clean category name and amount in dollars (e.g. "Chicken Wrap", 8.99)
- If tax is shown as a **decimal**, use it directly.
- If tax is shown as a **percentage**, calculate it based on subtotal.
- If both are shown, **use the amount**.
- If no tax is found, return 0.
- Return all amounts rounded to 2 decimal places.
Receipt:
"""
${text}
"""`;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        });
        const result = completion.choices[0]?.message?.content?.trim();
        if (!result) throw new Error("Empty response from OpenAI");
        const cleaned = result.replace(/```json|```/g, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
          throw new Error("OpenAI did not return valid JSON");
        }
        const parsed = JSON.parse(jsonMatch[0]);
        res.status(200).json(parsed);
      } catch (err) {
        error("OpenAI error:", err.message, err.stack);
        res.status(500).json({ error: "Failed to refine receipt", message: err.message });
      }
    });
  }
);
export const RecursivelyLooseRecord = z.lazy(() =>
  z.union([
    z.record(z.any()),   
    z.array(z.any()),    
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.undefined()
  ])
);
export const recurrenceIntervalSchema = z.object({
  unit: z.string(),
  value: z.number().min(1, "value must be at least 1")
});
export const EntrySchema = z.object({
  firebaseId: z.string().optional(),
  superId: z.string().optional(),
  items: z.record(
    z.object({
      category: z.string(),
      amount: z.number()
    })
  ).optional(),
  tax: z.number().optional(),
  isIncome: z.boolean().optional(),
  currency: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  paymentMethod: z.record(z.number().min(0).max(100)).refine(
    (pm) => Object.values(pm).reduce((a, b) => a + b, 0) === 100,
    { message: "Payment method percentages must total 100" }
  ).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "startDate must be in YYYY-MM-DD format"
  }).optional(),
  recurrenceCount: z.number().nullable().optional(),
  recurrenceInterval: recurrenceIntervalSchema.optional(),
  overrides: z.record(RecursivelyLooseRecord).optional(),
  remind: z.boolean().optional(),
  id: z.string().optional(),
});
export const ValidateRequestSchema = z.object({
  originalEntry: EntrySchema,
  modifiedEntry: EntrySchema,
  action: z.string(),
  mode: z.string().optional(),       
  field: z.string().optional(),
  itemField:z.string().optional(),      
  newValue: z.union([
    z.string(),
    z.number(),
    z.boolean()
  ]).optional(),                     
});
function generateOverrides({ field, newValue, itemField, originalEntry, recurrenceCount, mode, editCase, beforeChange = true }) {
  let overrides = {};
  if (mode === "simpleEdit" && editCase === "1stRecordForward"&&recurrenceCount>2) {
    const overrideKey = itemField ? `amount.${itemField}` : field;
    overrides = beforeChange
      ? { [overrideKey]: {
        "5-5": "somevalue1",
        "6-7": "somevalue2",
        "9-last": "somevalue1"
      }
 }
      : { [overrideKey]: "b" };
  }
  return overrides;
}
export const validateAndOptimizeOverridesAI = onRequest(
  {
    secrets: [OPENAI_API_KEY],
  },
  async (req, res) => {
    const corsHandler = cors(corsOptions);
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") return res.status(204).send('');
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
      const { originalEntry, modifiedEntry, action, mode, field, newValue,  itemField } = req.body;
      try {
        ValidateRequestSchema.parse({ originalEntry, modifiedEntry, action, mode, field ,newValue, itemField});
      } catch (err) {
        if (err instanceof ZodError) {
          const issues = err.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          return res.status(400).json({
            isValid: false,
            issues,
            error: "Input Validation Error",
          });
        }
        return res.status(500).json({
          isValid: false,
          issues: ["Unexpected validation error", err.message],
          error: "Validation Failure",
        });
      }
      const overrides={};
      const newPaymentMethod=modifiedEntry.paymentMethod;
    const paymentMethod = newPaymentMethod && typeof newPaymentMethod === "object" && !Array.isArray(newPaymentMethod)
  ? newPaymentMethod
  : {
      "<<<PLACEHOLDER_STRING_PAYMENTMETHOD_v1>>>": 100,
    };
          const newRecurrenceField=modifiedEntry.recurrenceInterval;
const recurrenceInterval = newRecurrenceField && typeof newRecurrenceField === "object" && !Array.isArray(newRecurrenceField)
  ? newRecurrenceField
  : {
      unit: "<<<PLACEHOLDER_STRING_UNIT_v1>>>",
      value: "<<<PLACEHOLDER_NUMBER_VALUE_v1>>>"
    };
const baseChange = {
...(
  mode === "simpleEdit" && itemField
    ? {
        items: {
          [itemField]: {
            category: field === "category" ? newValue : `<<<PLACEHOLDER_STRING_${itemField}.CATEGORY_v1>>>`,
            amount: field === "amount" ? newValue : `<<<PLACEHOLDER_NUMBER_${itemField}.AMOUNT_v1>>>`
          }
        }
      }
    : {
        items: modifiedEntry.items
      }
),
   ...(mode === "simpleEdit" && {
    startDate: field === "startDate" ? newValue : "<<<PLACEHOLDER_STRING_STARTDATE_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    tax: field === "tax" ? newValue : "<<<PLACEHOLDER_NUMBER_TAX_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    isIncome: field === "isIncome" ? newValue : "<<<PLACEHOLDER_BOOLEAN_ISINCOME_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    currency: field === "currency" ? newValue : "<<<PLACEHOLDER_STRING_CURRENCY_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    tags: field === "tags" ? newValue : "<<<PLACEHOLDER_STRINGT_TAGS_v1>>>"
  }),
  ...(mode === "notes" && {
    notes: field === "notes" ? newValue : "<<<PLACEHOLDER_STRING_NOTES_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    reason: field === "reason" ? newValue : "<<<PLACEHOLDER_STRING_REASON_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    origin: field === "origin" ? newValue : "<<<PLACEHOLDER_STRING_ORIGIN_v1>>>"
  }),
  ...(mode === "destination" && {
    destination: field === "destination" ? newValue : "<<<PLACEHOLDER_STRING_DESTINATION_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    remind: field === "remind" ? newValue : "<<<PLACEHOLDER_BOOLEAN_REMIND_v1>>>"
  }),
  ...(mode === "simpleEdit" && {
    recurrenceCount: field === "recurrenceCount" ? newValue : "<<<PLACEHOLDER_NUMBER_OR_NULLVALUE_RECURRENCECOUNT_v1>>>"
  }),
...(mode === "simpleEdit" && newRecurrenceField && {
  recurrenceInterval: recurrenceInterval
}),
...(mode === "simpleEdit" && newPaymentMethod && {
 paymentMethod:paymentMethod
}),
    overrides: overrides
};
      const prompt = `
You are an expert system for validating and optimizing entry overrides for a recurring transactions application.
An "entry" represents a transaction that can recur.
"overrides" is an object where keys are field names (e.g., "amount", "category", "items.1.amount")
and values are objects mapping recurrence indices (or ranges like "0-2") to new values for that specific occurrence.
"recurrenceCount" is the total number of occurrences (can be null for infinite).
Original Entry (before modification):
${JSON.stringify(originalEntry, null, 2)}
Modified Entry (after client-side modification):
${JSON.stringify(modifiedEntry, null, 2)}
Action Performed: ${action}
Tasks:
1. Validation:
    * Are override indices valid?
    * Are redundant values present?
    * Are overrides structurally valid?
    * Are item-level overrides valid?
    * Are there logical inconsistencies?
2. Optimization:
    * Can ranges be compacted?
    * Can empty fields be removed?
    * If recurrenceCount is 1, should overrides be cleared?
Output:
{
  "isValid": boolean,
  "issues": [String],
  "optimizedOverrides": Object | null
}
Return only a single raw JSON object. Do not include explanation, markdown, or formatting.
`;
      try {
        const chat = await openai.chat.completions.create({
          model: 'gpt-4',
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }],
        });
        const raw = chat.choices?.[0]?.message?.content?.trim();
        function extractFirstJsonBlock(text) {
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start === -1 || end === -1 || end <= start) return null;
          try {
            return JSON.parse(text.slice(start, end + 1));
          } catch {
            return null;
          }
        }
        const parsed = extractFirstJsonBlock(raw);
        if (!parsed || typeof parsed !== 'object' || !('isValid' in parsed)) {
          throw new Error("Invalid response structure from OpenAI");
        }
        return res.status(200).json(parsed);
      } catch (err) {
        return res.status(500).json({
          isValid: false,
          issues: ["AI failed to process validation request", err.message],
          error: "AI Processing Error",
        });
      }
    });
  }
);
export const fetchTransactions =
onRequest(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_KEY_PRODUCTION, PLAID_ENV] },
  (req, res) => {
    const corsHandler = cors(corsOptions);
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }
      const { userId, itemId } = req.body;
      if (!userId || !itemId) {
        return res.status(400).json({ error: "Missing userId or itemId in request body" });
      }
      const adminDB = getDatabase();
      let accessToken;
      try {
        const tokenSnap = await adminDB.ref(`/users/${userId}/plaidItems/${itemId}/accessToken`).once("value");
        accessToken = tokenSnap.val();
        if (!accessToken) {
          error(`No access token for userId: ${userId}, itemId: ${itemId}`);
          return res.status(404).json({ error: "Access token not found" });
        }
      } catch (err) {
        error(`Error fetching access token:`, err);
        return res.status(500).json({ error: "Database access error" });
      }
      const plaidClient = new PlaidApi(new Configuration({
        basePath: PlaidEnvironments[PLAID_ENV.value()] || PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            "PLAID-CLIENT-ID": PLAID_CLIENT_ID.value(),
            "PLAID-SECRET": PLAID_SECRET_KEY_PRODUCTION.value()
          }
        }
      }));
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);
      const formatDate = (d) => d.toISOString().split("T")[0];
      try {
        const existingTxIds = new Set();
        const txSnap = await adminDB.ref(`/users/${userId}/transactions`).once("value");
        if (txSnap.exists()) {
          txSnap.forEach(child => {
            const val = child.val();
            if (val?.plaidTransactionId) existingTxIds.add(val.plaidTransactionId);
          });
        }
        const plaidRes = await plaidClient.transactionsGet({
          access_token: accessToken,
          start_date: formatDate(startDate),
          end_date: formatDate(endDate)
        });
        const fetchedTx = plaidRes.data.transactions;
        const returnedEntries = [];
        let newCount = 0;
        const primaryToTag = {
          BANK_FEES: "Banking", ENTERTAINMENT: "Entertainment", FOOD_AND_DRINK: "Food",
          GENERAL_MERCHANDISE: "Shopping", HOME_IMPROVEMENT: "Home", INCOME: "Income",
          MEDICAL: "Health", PERSONAL_CARE: "Wellness", GENERAL_SERVICES: "Services",
          GOVERNMENT_AND_NON_PROFIT: "Government", RENT_AND_UTILITIES: "Housing",
          TAXES: "Taxes", TRANSFER: "Transfers", TRANSPORTATION: "Transport",
          TRAVEL: "Travel", LOAN_PAYMENTS: "Loans", INVESTMENTS: "Investments",
          INSURANCE: "Insurance", SUBSCRIPTIONS: "Subscriptions", OTHER: "Other"
        };
        for (const tx of fetchedTx) {
          const txId = tx.transaction_id;
          if (existingTxIds.has(txId)) continue;
          if (tx.pending && existingTxIds.has(tx.pending_transaction_id)) continue;
          const superId = uuidv4();
          const entry = {
            id: superId,
            superId,
            splitId: 0,
            source: "Plaid",
            importedAt: new Date().toISOString(),
            plaidTransactionId: txId,
            items: {
              "1": {
                category: tx.personal_finance_category?.detailed || "Uncategorized",
                amount: Math.abs(tx.amount)
              }
            },
            tax: 0,
            isIncome: tx.amount < 0,
            currency: tx.iso_currency_code || "USD",
            tags: [primaryToTag[tx.personal_finance_category?.primary] || "Other"],
            notes: tx.name,
            reason: tx.personal_finance_category?.primary || "",
            origin: tx.amount < 0 ? (tx.merchant_name || tx.name) : "",
            destination: tx.amount > 0 ? (tx.merchant_name || tx.name) : "",
            paymentMethod: { Other: Math.abs(tx.amount) },
            startDate: tx.date,
            recurrenceCount: 1,
            recurrenceInterval: { unit: "none", value: 0 },
            overrides: {},
            remind: false
          };
          returnedEntries.push(entry);
          newCount++;
        }
        return res.status(200).json({
          success: true,
          entries: returnedEntries,
          newTransactionsFetched: newCount,
          totalPlaidTransactionsProcessed: fetchedTx.length,
          message: `Fetched and returned ${newCount} new Plaid transactions for client-side encryption.`
        });
      } catch (error) {
        const errorData = error.response?.data;
        error(`Plaid fetch error:`, errorData || error.message, error.stack);
        if (errorData) {
          return res.status(error.response.status || 500).json({
            error: "Plaid API error.",
            plaid_error_code: errorData.error_code,
            plaid_error_message: errorData.error_message,
            plaid_error_type: errorData.error_type,
            request_id: errorData.request_id,
            detail: errorData
          });
        } else {
          return res.status(500).json({
            error: "Failed to fetch or process transactions.",
            detail: error.message
          });
        }
      }
    });
  }
);
export const exchangePublicToken =
onRequest(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_KEY_PRODUCTION, PLAID_ENV] },
  (req, res) => { 
    const corsHandler = cors(corsOptions);
corsHandler(req, res, async () => { 
      if (req.method === "OPTIONS") {
        return res.status(204).send('');
      }
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }
      const { public_token, userId } = req.body;
      if (!public_token || !userId) {
        return res.status(400).json({ error: "Missing public_token or userId in request body" });
      }
      const plaidClient = new PlaidApi(new Configuration({
        basePath: PlaidEnvironments[PLAID_ENV.value()] || PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': PLAID_CLIENT_ID.value(),
            'PLAID-SECRET': PLAID_SECRET_KEY_PRODUCTION.value(),
          },
        },
      }));
      try {
        const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
        const { access_token, item_id } = exchangeResponse.data;
        await getDatabase()
          .ref(`/users/${String(userId)}/plaidItems/${item_id}`)
          .set({
            accessToken: access_token,
            itemId: item_id,
            userId: String(userId),
            createdAt: new Date().toISOString(),
          });
        return res.status(200).json({
          success: true,
          itemId: item_id,
          message: "Access token exchanged and stored.",
        });
      } catch (error) {
        const errorData = error.response?.data;
        error("❌ Error during token exchange:", errorData || error.message, error.stack);
        if (errorData) {
          return res.status(error.response.status || 500).json({
            error: "Plaid API error during token exchange.",
            plaid_error_code: errorData.error_code,
            plaid_error_message: errorData.error_message,
            plaid_error_type: errorData.error_type,
            request_id: errorData.request_id,
            detail: errorData
          });
        } else {
          return res.status(500).json({
            error: "Failed to exchange public token or store Plaid item data.",
            detail: error.message,
          });
        }
      }
    });
  }
);
export const createLinkToken =
onRequest(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET_KEY_PRODUCTION, PLAID_ENV] },
  (req, res) => {
    const corsHandler = cors(corsOptions);
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") return res.status(204).send('');
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
      const { userId, accessToken } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      const plaidClient = new PlaidApi(new Configuration({
        basePath: PlaidEnvironments[PLAID_ENV.value()],
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': PLAID_CLIENT_ID.value(),
            'PLAID-SECRET': PLAID_SECRET_KEY_PRODUCTION.value(),
          },
        },
      }));
      const linkTokenRequest = {
        user: { client_user_id: String(userId) },
        client_name: 'DoobNeek',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      };
      if (accessToken) {
        linkTokenRequest.access_token = accessToken; 
      }
      try {
        const tokenResponse = await plaidClient.linkTokenCreate(linkTokenRequest);
        return res.status(200).json({ link_token: tokenResponse.data.link_token });
      } catch (error) {
        const errorData = error.response?.data;
        error('Plaid linkTokenCreate error:', errorData || error.message, error.stack);
        if (errorData) {
          return res.status(error.response.status || 500).json({
            error: "Plaid API error during link token creation.",
            plaid_error_code: errorData.error_code,
            plaid_error_message: errorData.error_message,
            plaid_error_type: errorData.error_type,
            request_id: errorData.request_id,
            detail: errorData
          });
        } else {
          return res.status(500).json({ error: 'Failed to create link token', detail: error.message });
        }
      }
    });
  }
);
const EMAIL_USER = defineSecret("EMAIL_USER");
const EMAIL_PASS = defineSecret("EMAIL_PASS");
export const getAccessToken =
onRequest((req, res) => {
  const corsHandler = cors(corsOptions);
  corsHandler(req, res, async () => {
    const userId = req.query.userId;
    info("🧪 Received request with userId:", userId);
    if (!userId) {
      warn("❌ No userId provided in query");
      return res.status(400).json({ error: "Missing userId" });
    }
    try {
      const db = getDatabase();
      const snap = await db.ref(`/users/${userId}/plaidItems`).once("value");
      info(`📦 Firebase path: /users/${userId}/plaidItems exists?`, snap.exists());
      const val = snap.val();
      info("📄 Raw plaidItems value:", val);
      const firstItem = val ? Object.values(val)[0] : null;
      if (firstItem?.accessToken) {
        info("✅ Access token found:", firstItem.accessToken);
        return res.status(200).json({ accessToken: firstItem.accessToken });
      } else {
        warn("⚠️ No access token found in first plaidItem.");
        return res.status(404).json({ accessToken: null });
      }
    } catch (err) {
      error("❌ Error in getAccessToken:", err.message, err.stack);
      return res.status(500).json({ error: "Failed to fetch access token" });
    }
  });
});
export const sendEmailReminder =
onRequest(
  { secrets: [EMAIL_USER, EMAIL_PASS] },
  (req, res) => {
    const corsHandler = cors(corsOptions);
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") {
        return res.status(204).send('');
      }
      const emailUser = EMAIL_USER.value();  
      const emailPass = EMAIL_PASS.value();
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: emailUser,
          pass: emailPass,
        }
      });
      const { emails, itemDescription, eventDate, reminderDate } = req.body;
      if (!emails?.length || !eventDate) {
        return res.status(400).json({ error: "Missing data" });
      }
      const message = `
Reminder: You have a transaction on ${eventDate}
Description: ${itemDescription || "No description provided"}
      `;
      try {
 await Promise.all(
  emails.map(email =>
    transporter.sendMail({
      from: `"doobneek Reminder" <${emailUser}>`, 
      to: email,
      subject: "Upcoming Transaction Reminder",
      text: message
    })
  )
);
        res.status(200).send("Email(s) sent.");
      } catch (err) {
        error("❌ Email send failed", err);
        res.status(500).send("Failed to send email.");
      }
      const createICS = () => {
        const start = new Date(eventDate);
        const end = new Date(start.getTime() + 30 * 60 * 1000); 
        const formatICSDate = (date) =>
          date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        let rrule = "";
           const icsLines = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//doobneek Reminder//EN",
          "BEGIN:VEVENT",
          `UID:${Date.now()}@doobneek.org`,
          `DTSTAMP:${formatICSDate(new Date())}`,
          `DTSTART:${formatICSDate(start)}`,
          `DTEND:${formatICSDate(end)}`,
          `SUMMARY:${itemDescription}`,
          "DESCRIPTION:This is a reminder for your upcoming transaction.",
          "STATUS:CONFIRMED",
          "SEQUENCE:0",
          "BEGIN:VALARM",
          "TRIGGER:-PT10M",
          "ACTION:DISPLAY",
          "DESCRIPTION:Reminder",
          "END:VALARM",
          "END:VEVENT",
          "END:VCALENDAR"
        ];
return icsLines.join("\r\n"); 
      };
    });
  }
);
export const openaiVoiceTransaction =
onRequest(
  { secrets: [OPENAI_API_KEY] },
  (req, res) => {
    const corsHandler = cors(corsOptions);
corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }
      const { transcript } = req.body;
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "Missing or invalid transcript" });
      }
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
      const today = new Date().toISOString().split("T")[0]; 
      const prompt = `
You are a helpful assistant that extracts structured transaction details from spoken input.
Given the following transcript:
"""
${transcript}
"""
Return ONLY a JSON object with these keys:
{
  "amount": number,
  "isIncome": boolean,
  "category": string,         
  "reason": string,           
  "startDate": "YYYY-MM-DD", 
  "destination": string, 
  "origin": string,  
  "notes": string 
}
🔍 Field Guidelines:
- "category": Should be the **most specific label** available. Examples:
    - If the user says "bought apples", category = "apples"
    - If the user says "spent money for fun", category = "fun"
    - If the user says "paid for Uber", category = "uber"
- "reason": A **general purpose** or **interpreted intent**, such as "transportation", "recreation", "essentials", "gift", "work", or "medical".
- "startDate": Parse relative terms like "today", "tomorrow", or "last week" into "YYYY-MM-DD" format.
- If no date is mentioned, use today's date: "${today}".
- "origin" is who paid you (for income). "destination" is who/what you paid (for expenses).
- "notes" should capture any extra information from the transcript that doesn't fit into the above categories. For example, if a user mentions "paid with a gift card," include it in the "notes" field.
Return only the JSON object. No extra commentary.
`;
  try {
  const completion = await openai.chat.completions.create({
    model: "gpt-4", 
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });
  const result = completion.choices?.[0]?.message?.content?.trim();
  info("✅ GPT raw response:", result);
  if (!result) throw new Error("GPT returned an empty response");
  const cleaned = result.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error("GPT did not return valid JSON format");
  }
  const parsed = JSON.parse(jsonMatch[0]);
  const requiredFields = ["amount", "isIncome", "category", "reason", "startDate", "destination", "origin"];
  for (const field of requiredFields) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  if (!("notes" in parsed)) {
    parsed.notes = "";
  }
  res.status(200).json(parsed);
} catch (err) {
  error("❌ GPT parse error:", err.message, "\nStack:", err.stack);
  res.status(500).json({ error: "Failed to process transaction", message: err.message });
}
    });
  }
);