# n8n Haiku 4.5 Extraction Prompts for Loan Applications

This file contains the complete system message and user prompt for extracting loan application data using Claude Haiku 4.5 in n8n.

---

## SYSTEM MESSAGE
Copy this verbatim into the "System Message" field of your n8n Anthropic node:

```
You are an expert data extraction specialist for business loan applications. Your task is to extract structured information from loan application documents and output it as valid JSON following a precise schema.

CORE RULES:
1. Extract data accurately - never guess or fabricate information
2. Use null for missing values (NEVER use empty strings "", "-", or "N/A")
3. Follow the exact schema structure provided - output ALL fields even if null
4. Parse numeric values intelligently (handle abbreviations like "2M", "500k", ranges, etc.)
5. Normalize dates to YYYY-MM-DD format
6. Split full names into separate first/middle/last name fields
7. Structure addresses as objects with separate fields (not concatenated strings)
8. Extract both cell phone and home phone as separate fields
9. Calculate a confidence_score (0.0-1.0) based on extraction quality

OUTPUT FORMAT (CRITICAL - FOLLOW EXACTLY):
- Output ONLY the raw JSON object
- Do NOT wrap in markdown code blocks
- Do NOT use ```json or ``` or any backticks
- Do NOT add any text before the JSON
- Do NOT add any text after the JSON
- Your entire response must be ONLY the JSON
- First character must be {
- Last character must be }
- Use double quotes for all strings
- Ensure proper JSON syntax (commas, brackets, etc.)

INCORRECT OUTPUT EXAMPLE (DO NOT DO THIS):
```json
{ "company": ... }
```

CORRECT OUTPUT EXAMPLE (DO THIS):
{ "company": ... }

If a field cannot be extracted from the document, set it to null. If extraction quality is poor, reflect this in a lower confidence_score.
```

---

## USER PROMPT
Copy this verbatim into the "User Prompt" or "Message" field of your n8n Anthropic node:

```
Extract all loan application information from the provided document and return it as valid JSON following the schema below.

# OUTPUT SCHEMA

Your output must match this exact structure:

{
  "company": {
    "legal_name": "string (REQUIRED)",
    "dba_name": "string or null",
    "ein": "string in format XX-XXXXXXX (REQUIRED)",
    "industry": "string or null",
    "address_line1": "string (REQUIRED)",
    "address_line2": "string or null",
    "city": "string (REQUIRED)",
    "state": "string 2-letter uppercase (REQUIRED)",
    "zip": "string 5 or 9-digit format (REQUIRED)",
    "phone": "string or null",
    "email": "string or null",
    "website": "string or null"
  },
  "application": {
    "submission_id": "UUID string or null",
    "document_id": "UUID string or null",
    "business_structure": "enum: 'Sole Proprietorship' | 'Partnership' | 'LLC' | 'Corporation' | 'S-Corp' | 'C-Corp' | 'Non-Profit' | 'Other' | null",
    "start_date": "string YYYY-MM-DD format or null",
    "years_in_business": "number or null",
    "number_of_employees": "integer or null",
    "annual_revenue": "number (pure numeric, no $ or commas) or null",
    "amount_requested": "number (pure numeric, no $ or commas) or null",
    "loan_purpose": "string or null",
    "owner_1_first_name": "string (REQUIRED)",
    "owner_1_middle_name": "string or null",
    "owner_1_last_name": "string (REQUIRED)",
    "owner_1_ssn": "string in format XXX-XX-XXXX or null",
    "owner_1_dob": "string YYYY-MM-DD format or null",
    "owner_1_ownership_pct": "number 0-100 or null",
    "owner_1_address": {
      "address_line1": "string",
      "address_line2": "string or null",
      "city": "string",
      "state": "string 2-letter uppercase",
      "zip": "string 5 or 9-digit format"
    } OR null,
    "owner_1_cell_phone": "string or null",
    "owner_1_home_phone": "string or null",
    "owner_1_email": "string or null",
    "owner_2_first_name": "string or null",
    "owner_2_middle_name": "string or null",
    "owner_2_last_name": "string or null",
    "owner_2_ssn": "string in format XXX-XX-XXXX or null",
    "owner_2_dob": "string YYYY-MM-DD format or null",
    "owner_2_ownership_pct": "number 0-100 or null",
    "owner_2_address": {
      "address_line1": "string",
      "address_line2": "string or null",
      "city": "string",
      "state": "string 2-letter uppercase",
      "zip": "string 5 or 9-digit format"
    } OR null,
    "owner_2_cell_phone": "string or null",
    "owner_2_home_phone": "string or null",
    "owner_2_email": "string or null"
  },
  "confidence_score": "number between 0.0 and 1.0"
}

# EXTRACTION RULES

## Name Extraction
- If document shows "John Michael Smith", split into:
  - owner_1_first_name: "John"
  - owner_1_middle_name: "Michael"
  - owner_1_last_name: "Smith"
- If 2 words: First + Last (middle_name = null)
- If 3+ words: First + Middle + Last
- Remove titles (Mr., Mrs., Dr.)

## Address Extraction
- Extract addresses as structured objects with separate fields
- If document shows "456 Oak Ave Suite 2, New York, NY 10001":
  - address_line1: "456 Oak Ave"
  - address_line2: "Suite 2"
  - city: "New York"
  - state: "NY"
  - zip: "10001"
- If no owner_2 exists, set owner_2_address to null (not an object with null fields)

## Phone Extraction
- Extract BOTH cell and home phone as separate fields
- If document labels them: map directly
- If unlabeled: first number → cell_phone, second → home_phone
- If only one phone: put in cell_phone, set home_phone to null

## Numeric Parsing (Revenue & Funding Amount)
Parse intelligently:
- "2M" or "2 million" → 2000000
- "500k" or "500 thousand" → 500000
- "$1.5M" → 1500000
- "500k-1M" (range) → 1000000 (use maximum)
- Strip all $, commas, spaces
- If labeled "monthly", multiply by 12 for annual
- Output pure numbers (no strings, no formatting)

## Date Normalization
Convert all dates to YYYY-MM-DD:
- "11/10/1984" → "1984-11-10"
- "November 10, 1984" → "1984-11-10"
- "11-10-1984" → "1984-11-10"

## SSN Normalization
- Extract FULL 9-digit SSN
- Normalize to XXX-XX-XXXX format
- "123456789" → "123-45-6789"

## EIN Normalization
- Extract 9-digit EIN
- Normalize to XX-XXXXXXX format
- "123456789" → "12-3456789"

## Ownership Percentage
- Store as number 0-100 (not 0-1 decimal)
- "0.5" → 50
- "50%" → 50

## Business Structure
Map variations to standard values:
- "Limited Liability Company" → "LLC"
- "Inc." or "Incorporated" → "Corporation"
- "S Corporation" → "S-Corp"
- "C Corporation" → "C-Corp"

## Start Date
- Look for: "date established", "incorporation date", "founded"
- If only "years in business" is given (e.g., "5 years"), calculate backwards from current date
- Always output in YYYY-MM-DD format

## Owner 2 Handling
- If document only mentions one owner, set ALL owner_2_* fields to null
- Do not create empty objects with null properties

## Confidence Score
- 0.9-1.0: Excellent extraction, all required fields clear
- 0.7-0.89: Good extraction, minor unclear fields
- 0.5-0.69: Fair extraction, several fields unclear or missing
- Below 0.5: Poor extraction, document illegible or incomplete

# DOCUMENT TO EXTRACT

{{$json.document_text}}

# OUTPUT INSTRUCTIONS (CRITICAL)

IMPORTANT: Your response must be ONLY the raw JSON object.

DO NOT wrap the JSON in markdown code blocks.
DO NOT use ```json or ``` or any backticks.
DO NOT add explanatory text.

Your response must start with { and end with }.

INCORRECT (DO NOT DO THIS):
```json
{"company": ...}
```

CORRECT (DO THIS):
{"company": ...}
```

---

## n8n INTEGRATION NOTES

### Complete Workflow Setup

**Recommended n8n Node Flow:**
```
[Trigger/Webhook]
    ↓
[Extract PDF Text] (if needed)
    ↓
[Anthropic Claude Node] ← System Message + User Prompt
    ↓
[Code Node] ← Clean markdown & extract JSON
    ↓
[Validation/Processing] ← Use extracted data
```

### Variable Injection
Replace `{{$json.document_text}}` with the actual n8n variable containing your document text. Common n8n variables:
- `{{$json.document_text}}` - if using a "Extract from File" or "PDF Extract" node before this
- `{{$json.text}}` - common output from PDF parsers
- `{{$binary.data}}` - if passing raw PDF file (Claude can read PDFs directly)

### Node Configuration
1. **Model**: Select "claude-3-5-haiku-20241022" (Haiku 4.5)
2. **System Message**: Paste the SYSTEM MESSAGE above
3. **User Prompt**: Paste the USER PROMPT above (with proper variable injection)
4. **Temperature**: Set to 0.0 (for deterministic extraction)
5. **Max Tokens**: Set to 4096 (sufficient for full schema output)

### Output Parsing

**⚠️ IMPORTANT: Handling the n8n Anthropic Response Structure**

The Anthropic node in n8n returns a nested structure like this:
```json
[
  {
    "content": [
      {
        "type": "text",
        "text": "{ \"company\": { ... } }"
      }
    ]
  }
]
```

**Steps to Extract Clean JSON:**

1. **Add a Code Node** after the Anthropic node with this JavaScript:

```javascript
// Extract the text from n8n's Anthropic response structure
let responseText = $input.item.json[0].content[0].text;

// Strip markdown code blocks if present (```json and ```)
responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

// Trim whitespace
responseText = responseText.trim();

// Parse the JSON
const extractedData = JSON.parse(responseText);

// Return the parsed object
return { json: extractedData };
```

2. **Alternative: Use Set Node + JSON Parse Node**
   - **Set Node**: Extract the text using expression: `{{$json[0].content[0].text}}`
   - **Code Node**: Strip markdown using the code above
   - **JSON Parse Node**: Parse the cleaned string

3. **Access Extracted Fields**
   - After parsing, access fields with: `{{$json.company.legal_name}}`, `{{$json.application.owner_1_first_name}}`, etc.

### Error Handling
Add error handling for:
- Invalid JSON output (use try/catch in JSON Parse node)
- Missing required fields (validate company.legal_name, company.ein, etc. exist)
- Low confidence_score (set a threshold, e.g., reject if < 0.7)

---

## TESTING CHECKLIST

Before going to production, test with documents that have:
- ✅ Single owner vs two owners
- ✅ Concatenated addresses vs structured addresses
- ✅ Abbreviated revenue amounts ("2M", "500k")
- ✅ Various date formats
- ✅ Missing optional fields
- ✅ Poor quality scans (OCR errors)

Verify output:
- ✅ Is valid JSON (no markdown wrapping)
- ✅ Has all required fields present (even if null)
- ✅ Dates are YYYY-MM-DD format
- ✅ Numbers are pure numeric (not strings)
- ✅ SSN/EIN are properly formatted with hyphens
- ✅ Addresses are objects (not concatenated strings)
- ✅ Names are split into first/middle/last
- ✅ confidence_score is between 0.0 and 1.0

---

## TROUBLESHOOTING

### Issue: Haiku Still Returns Markdown Code Blocks

**Problem:**
Despite instructions to not use markdown, Haiku returns:
```json
[
  {
    "content": [
      {
        "type": "text",
        "text": "```json\n{...}\n```"
      }
    ]
  }
]
```

**Solution:**
This is expected behavior with Claude models. Use the Code Node provided above to strip markdown:

```javascript
// Extract and clean the response
let responseText = $input.item.json[0].content[0].text;
responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
const extractedData = JSON.parse(responseText);
return { json: extractedData };
```

**Why This Happens:**
Claude models (including Haiku) are trained to format JSON with markdown for better readability. While we can minimize this with strong instructions, it's more reliable to handle it programmatically in post-processing.

### Issue: JSON Parse Error

**Problem:**
The Code Node throws `JSON.parse() error`.

**Debugging Steps:**
1. Add a debug step before parsing:
   ```javascript
   console.log("Raw response:", $input.item.json[0].content[0].text);
   ```
2. Check if the text is actually JSON
3. Look for:
   - Extra text before/after JSON
   - Single quotes instead of double quotes
   - Missing commas or brackets
   - Incomplete JSON (truncated due to token limit)

**Solution:**
- Increase `Max Tokens` in Anthropic node to 4096
- Add more robust cleaning:
  ```javascript
  let responseText = $input.item.json[0].content[0].text;

  // Find the actual JSON (between first { and last })
  const firstBrace = responseText.indexOf('{');
  const lastBrace = responseText.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1) {
    responseText = responseText.substring(firstBrace, lastBrace + 1);
  }

  const extractedData = JSON.parse(responseText);
  return { json: extractedData };
  ```

### Issue: Low Confidence Scores

**Problem:**
Extraction consistently returns confidence_score < 0.7

**Possible Causes:**
1. Poor quality scans (low OCR accuracy)
2. Handwritten applications
3. Non-standard form layouts
4. Missing critical information

**Solutions:**
- Improve PDF quality before extraction
- Use OCR preprocessing for scanned documents
- Manual review workflow for low-confidence extractions
- Adjust confidence threshold based on your use case

### Issue: Missing Required Fields

**Problem:**
Required fields (legal_name, ein, owner names) are null

**Debugging:**
1. Check if the PDF actually contains this information
2. Verify the PDF text extraction worked correctly
3. Test with a well-formatted sample document

**Solutions:**
- Add a validation node that rejects applications missing required fields
- Implement a fallback to manual data entry
- Set up notifications for incomplete extractions
