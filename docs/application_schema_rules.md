# ClearScrub Application Extraction Rules (Schema v2.0)

## General Principles

### Null Handling
- Use `null` for missing values
- NEVER use empty strings `""`, `"-"`, or `"N/A"`
- If owner_2 is completely empty, all `owner_2_*` fields should be `null`
- For structured fields (address objects), use `null` for the entire object if no data exists - do NOT create empty objects with all null properties

### Field Matching Strategy
- Match extracted fields against `x-alternate-labels` using fuzzy matching or semantic similarity
- The AI should recognize variations of field names and map them correctly
- Case-insensitive matching recommended

### Semantic Parsing (Numeric Fields)
For `annual_revenue` and `amount_requested`:
- Use intelligent interpretation, not just regex
- Handle abbreviations, ranges, written numbers, various formats
- See field-level `x-extraction-instructions` for specifics

## Specific Transformation Rules

### Name Splitting (v2 Change)
**Rule:** Split full names into separate first, middle, and last name components
**Format:**
- `owner_1_first_name`: First name only
- `owner_1_middle_name`: Middle name or initial (can be null)
- `owner_1_last_name`: Last name/surname only

**Examples:**
- Input: `"John Smith"` → Output: `{first_name: "John", middle_name: null, last_name: "Smith"}`
- Input: `"Mary Jane Watson"` → Output: `{first_name: "Mary", middle_name: "Jane", last_name: "Watson"}`
- Input: `"Robert J. Johnson"` → Output: `{first_name: "Robert", middle_name: "J.", last_name: "Johnson"}`

**Parsing Strategy:**
- If 2 words: First + Last
- If 3+ words: First + (everything except last word as middle) + Last
- Handle titles (Mr., Mrs., Dr.) by removing them
- Handle suffixes (Jr., Sr., III) as part of last name or separate suffix field if schema evolves

### Address Structuring (v2 Change)
**Rule:** Extract address components into structured object with separate fields
**Required Fields:** `address_line1`, `city`, `state`, `zip`
**Optional Fields:** `address_line2`

**Structure:**
```json
{
  "address_line1": "123 Main St",
  "address_line2": "Suite 400",
  "city": "Los Angeles",
  "state": "CA",
  "zip": "90001"
}
```

**Parsing Strategy:**
- If address is single concatenated string, split intelligently:
  - `address_line1`: Everything before first comma
  - Parse remainder for City, State ZIP pattern
  - Look for suite/apt/unit keywords for `address_line2`
- If address fields are already separate in document, map directly
- State must be 2-letter uppercase code
- ZIP must match pattern: `^[0-9]{5}(-[0-9]{4})?$`

**Examples:**
- Input: `"456 Oak Ave Suite 2, New York, NY 10001"`
  ```json
  {
    "address_line1": "456 Oak Ave",
    "address_line2": "Suite 2",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  }
  ```
- Input: `"789 Pine St, Boston, MA 02101"`
  ```json
  {
    "address_line1": "789 Pine St",
    "address_line2": null,
    "city": "Boston",
    "state": "MA",
    "zip": "02101"
  }
  ```

### Phone Field Extraction (v2 Change)
**Rule:** Extract BOTH cell and home phone as separate fields
**Fields:**
- `owner_1_cell_phone`: Cell/mobile phone number
- `owner_1_home_phone`: Home/landline phone number

**Extraction Strategy:**
- If document clearly labels phone types (cell, mobile, home, landline), map directly
- If document has multiple unlabeled phone numbers:
  1. First number → `owner_1_cell_phone`
  2. Second number → `owner_1_home_phone`
- If only one phone number exists and not labeled:
  - Default to `owner_1_cell_phone`
  - Set `owner_1_home_phone` to `null`

**Priority When Labels Are Ambiguous:**
1. `cell_phone`, `mobile_phone`, `mobile` → `owner_1_cell_phone`
2. `home_phone`, `landline`, `home` → `owner_1_home_phone`
3. `work_phone`, `office_phone` → Use best judgment based on context

### Submission and Document Tracking (v2 Addition)
**Rule:** Generate or assign unique identifiers for linking
**Fields:**
- `submission_id`: UUID linking this application to its bank statements
- `document_id`: UUID for this specific document in storage

**Assignment Strategy:**
- If extraction service receives these IDs from upstream system, use those values
- If not provided, generate UUIDs (v4 recommended)
- These enable linking application to multiple bank statement documents in the same submission

### Business Start Date (v2 Addition)
**Rule:** Extract actual date business was established
**Field:** `start_date` (format: `YYYY-MM-DD`)

**Extraction Strategy:**
- Look for: "date established", "incorporation date", "founded", "started on"
- If only `years_in_business` is provided:
  - Calculate backwards from current date
  - Example: Document dated 2025-01-15, "5 years in business" → `start_date: "2020-01-15"`
- Normalize all date formats to ISO 8601: `YYYY-MM-DD`

**Relationship with years_in_business:**
- Both fields can coexist
- `start_date` is the actual date (preferred if available)
- `years_in_business` is calculated duration (can be derived from start_date)

### SSN Normalization
**Rule:** Extract FULL 9-digit SSN and normalize to hyphenated format
**Input Formats:**
- `123456789` → `123-45-6789`
- `123-45-6789` → `123-45-6789` (already formatted)
**Security:** Store full SSN as requested

### Date Normalization
**Rule:** Convert all date formats to ISO 8601 (YYYY-MM-DD)
**Input Formats:**
- `MM/DD/YYYY` → `YYYY-MM-DD`
- `11/10/1984` → `1984-11-10`
- `November 10, 1984` → `1984-11-10`
- `11-10-1984` → `1984-11-10`
**Validation:** Date must be in past, person must be 18+

### Numeric Formatting

#### Currency Amounts
**Strip:** All `$`, commas, whitespace
**Examples:**
- `$2,500,000` → `2500000`
- `$ 1.5M` → `1500000`

#### Abbreviations
**Case Insensitive:**
- `M`, `m`, `MM` = million (× 1,000,000)
- `K`, `k` = thousand (× 1,000)
- `B`, `b` = billion (× 1,000,000,000)

**Examples:**
- `2M` → `2000000`
- `500k` → `500000`
- `1.5M` → `1500000`

#### Written Numbers
**Convert to numeric:**
- `two million` → `2000000`
- `five hundred thousand` → `500000`
- `1.5 million` → `1500000`

#### Ranges
**Rule:** Use MAXIMUM value
**Examples:**
- `500k-1M` → `1000000`
- `$1M-$2M` → `2000000`
- `2-3 years` → `2.5` (for years_in_business, use midpoint)

#### Monthly to Annual Conversion
**Rule:** If revenue is labeled as monthly, multiply by 12
**Example:**
- `Monthly Revenue: $50k` → `600000` (annual)

#### Ownership Percentage
**Rule:** Store as number between 0-100 (not 0-1)
**Examples:**
- `0.5` (decimal) → `50`
- `50%` (with symbol) → `50`
- `50` → `50`

### Business Structure Normalization
**Rule:** Map variations to standard enum values
**Mappings:**
- `Limited Liability Company` → `LLC`
- `Inc.`, `Incorporated` → `Corporation`
- `S Corporation` → `S-Corp`
- `C Corporation` → `C-Corp`
- `Sole Prop` → `Sole Proprietorship`

## Validation Rules

### Required Fields (Must Be Present)
**Company Section:**
- `company.legal_name`
- `company.ein`
- `company.address_line1`
- `company.city`
- `company.state`
- `company.zip`

**Application Section:**
- `application.owner_1_first_name`
- `application.owner_1_last_name`

**Address Objects (when present):**
- `owner_1_address.address_line1`
- `owner_1_address.city`
- `owner_1_address.state`
- `owner_1_address.zip`

### Pattern Validations
- **EIN:** `^[0-9]{2}-[0-9]{7}$`
- **State:** `^[A-Z]{2}$`
- **ZIP:** `^[0-9]{5}(-[0-9]{4})?$`
- **SSN:** `^[0-9]{3}-[0-9]{2}-[0-9]{4}$`
- **Date:** `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`
- **Email:** Valid email format
- **UUID:** Valid UUID v4 format (if generating submission_id/document_id)

### Confidence Threshold
- Flag fields with confidence < 0.7 as low confidence
- Include in quality report if needed

## Output Guidelines

### Type Consistency
- Numeric fields return numbers, not strings
- Date fields return strings in YYYY-MM-DD format
- Boolean fields return true/false, not "yes"/"no"
- Null fields return `null`, not empty string
- Address fields return objects (or null), not concatenated strings

### Complete Data Structure (v2 Example)
Always return the complete schema structure with all fields present (even if null):
```json
{
  "company": {
    "legal_name": "ACME Corporation",
    "dba_name": null,
    "ein": "12-3456789",
    "industry": "Manufacturing",
    "address_line1": "123 Business Blvd",
    "address_line2": "Suite 100",
    "city": "Chicago",
    "state": "IL",
    "zip": "60601",
    "phone": "3125551234",
    "email": "info@acme.com",
    "website": "www.acme.com"
  },
  "application": {
    "submission_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "document_id": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
    "business_structure": "Corporation",
    "start_date": "2015-03-15",
    "years_in_business": 9.8,
    "number_of_employees": 45,
    "annual_revenue": 5500000,
    "amount_requested": 250000,
    "loan_purpose": "Equipment purchase and expansion",
    "owner_1_first_name": "John",
    "owner_1_middle_name": "Michael",
    "owner_1_last_name": "Smith",
    "owner_1_ssn": "123-45-6789",
    "owner_1_dob": "1975-06-20",
    "owner_1_ownership_pct": 60,
    "owner_1_address": {
      "address_line1": "456 Residential St",
      "address_line2": "Apt 3B",
      "city": "Chicago",
      "state": "IL",
      "zip": "60602"
    },
    "owner_1_cell_phone": "3125559876",
    "owner_1_home_phone": null,
    "owner_1_email": "john.smith@email.com",
    "owner_2_first_name": "Jane",
    "owner_2_middle_name": null,
    "owner_2_last_name": "Doe",
    "owner_2_ssn": "987-65-4321",
    "owner_2_dob": "1980-09-15",
    "owner_2_ownership_pct": 40,
    "owner_2_address": {
      "address_line1": "789 Oak Avenue",
      "address_line2": null,
      "city": "Evanston",
      "state": "IL",
      "zip": "60201"
    },
    "owner_2_cell_phone": "8475551234",
    "owner_2_home_phone": "8475555678",
    "owner_2_email": "jane.doe@email.com"
  },
  "confidence_score": 0.92
}
```

### Error Handling
- If a required field cannot be extracted, set it to `null` but flag in confidence/quality metrics
- Never skip fields - all schema fields must be present in output
- Document extraction failures for debugging

## Quality Metrics

Track and report:
- Number of required fields successfully extracted
- Number of optional fields extracted
- Fields with low confidence scores
- Any extraction warnings or errors
- Overall document confidence score

## Edge Cases

### Single Owner Applications
- If only one owner: all `owner_2_*` fields should be `null`
- For structured fields like `owner_2_address`, set entire object to `null` (not an object with null properties)
- Example:
  ```json
  {
    "owner_2_first_name": null,
    "owner_2_last_name": null,
    "owner_2_address": null,
    "owner_2_cell_phone": null,
    "owner_2_home_phone": null
  }
  ```

### Missing EIN
- If business uses SSN instead of EIN (sole proprietorship), document this
- Store in EIN field if it's formatted like EIN
- Flag in quality metrics if confidence is low

### Multiple Business Names
- `legal_name`: Official legal name from incorporation
- `dba_name`: Operating name if different
- If they're the same, `dba_name` can be `null` or same as `legal_name`

### International Addresses
- Schema assumes US addresses
- For non-US: do best effort to fit into state/zip fields or document in notes

### Address Objects Without All Required Fields
- If document provides partial address (e.g., only city/state but no street):
  - Extract what's available
  - Set missing required fields to `null`
  - Flag in confidence/quality metrics
- Example of partial address:
  ```json
  {
    "address_line1": null,
    "address_line2": null,
    "city": "New York",
    "state": "NY",
    "zip": null
  }
  ```

### Field Name Changes from v1 to v2
**Updated Field Names:**
- `requested_funding` → `amount_requested`
- `funding_purpose` → `loan_purpose`
- `owner_1_name` → `owner_1_first_name`, `owner_1_middle_name`, `owner_1_last_name`
- `owner_1_phone` → `owner_1_cell_phone`, `owner_1_home_phone`
- `owner_1_address` (string) → `owner_1_address` (object)

Extraction systems must use v2 field names in output.
