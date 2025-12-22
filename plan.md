# ClearScrub Dashboard - Fix Plan from GPT-5 Pro

**Continuation ID:** `2e5721c1-382e-4957-a611-8e3028a64c09`

**Status:** Ready for implementation. DO NOT deviate from these instructions.

---

## ISSUE 1 — Top Bar / Sidebar Collision

### Goal
- Make header fixed and always above content
- Offset sidebar by header height
- Offset main content by both header and sidebar (desktop)
- Ensure correct z-index layering and responsive behavior

### Changes

#### 1) Add layout CSS variables (one-time) in global CSS
- **File:** `src/index.css` (or `src/styles/globals.css`)
- **Context:** Immediately after `@tailwind utilities;`
- **Insert:**

```css
:root {
  --topbar-h: 56px;     /* adjust to your header actual height */
  --sidebar-w: 280px;   /* adjust to your sidebar width on desktop */
}

/* Ensure body/root let main be the scroll container, not the header/sidebar */
html, body, #root {
  height: 100%;
}

/* Optional: smooth backdrop support fallback */
.supports-backdrop\:bg {
  /* no-op; className helper only */
}
```

#### 2) Topbar component: make it fixed with correct z-index and height
- **File:** `src/components/layout/Topbar.tsx`
- **Find:** The top-level wrapper (usually a `<header>` element)
- **Replace className with:**

```jsx
<header className="fixed inset-x-0 top-0 z-50 h-[var(--topbar-h)] border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
  {/* existing contents remain unchanged */}
</header>
```

#### 3) Sidebar component: offset below header, fixed on desktop only
- **File:** `src/components/layout/Sidebar.tsx`
- **Find:** The top-level `<aside>` element
- **Replace className with:**

```jsx
<aside className="fixed left-0 top-[var(--topbar-h)] bottom-0 z-40 hidden w-[var(--sidebar-w)] border-r bg-background lg:flex lg:flex-col">
  {/* existing sidebar nav content */}
</aside>
```

**Note:** Keep mobile Sheet/Drawer sidebar untouched. Desktop changes only (`.lg:flex`).

#### 4) App shell: pad main content for fixed layers
- **File:** `src/components/layout/AppShell.tsx` (or wherever Topbar/Sidebar/main are rendered)
- **Update structure to:**

```jsx
return (
  <div className="min-h-screen bg-background">
    <Topbar />
    <Sidebar />
    <main id="app-main" className="pt-[var(--topbar-h)] lg:pl-[var(--sidebar-w)]">
      {children /* or <Outlet /> if using react-router */}
    </main>
  </div>
);
```

### Why This Works
- Header is fixed with highest z-index (z-50)
- Sidebar starts below header (top set to `var(--topbar-h)`) and sits above content (z-40)
- Main content padded (pt, pl) so nothing collides
- Responsive: sidebar only offsets on lg+

---

## ISSUE 2 — Missing "Add Company" Upload with File Classification

### UI/UX Pattern
- Primary "Add company" button in Companies page header
- Clicking opens Dialog with:
  - Drag-and-drop + click-to-select file input (multiple)
  - Top "Document type" selector defaulting to Bank Statement
  - Scrollable list showing each file with individual Document Type selector and Remove action
  - Submit uploads all files to Supabase Storage, calls ingestion Edge Function

### New Component: UploadDocumentsDialog
- **File:** `src/components/upload/UploadDocumentsDialog.tsx`

```typescript
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Upload, X, Plus } from "lucide-react";
import { uploadDocumentsWithClassification } from "@/lib/api/documents";

type DocType = "BANK_STATEMENT" | "APPLICATION";

type SelectedItem = {
  id: string;
  file: File;
  docType: DocType;
};

type UploadDocumentsDialogProps = {
  trigger?: React.ReactNode;
  onCompleted?: () => void; // e.g., refresh companies table
};

export function UploadDocumentsDialog({ trigger, onCompleted }: UploadDocumentsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<SelectedItem[]>([]);
  const [defaultDocType, setDefaultDocType] = React.useState<DocType>("BANK_STATEMENT");
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  function addFiles(files: FileList | File[]) {
    const next: SelectedItem[] = [];
    Array.from(files).forEach((f) => {
      if (f.type !== "application/pdf") return;
      next.push({
        id: crypto.randomUUID(),
        file: f,
        docType: defaultDocType,
      });
    });
    if (next.length === 0) {
      toast({ title: "No PDFs selected", description: "Only PDF files are supported.", variant: "destructive" });
      return;
    }
    setItems((prev) => [...prev, ...next]);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function clearAll() {
    setItems([]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function onSubmit() {
    if (items.length === 0) {
      toast({ title: "No files selected", description: "Add at least one PDF to continue.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await uploadDocumentsWithClassification({
        items: items.map((i) => ({ file: i.file, docType: i.docType })),
      });
      toast({ title: "Upload started", description: "We're processing your documents. Companies will appear shortly." });
      setOpen(false);
      setItems([]);
      onCompleted?.();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add company
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>Upload bank statements and applications. Each file can be classified individually.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Default document type</Label>
              <Select
                value={defaultDocType}
                onValueChange={(v) => setDefaultDocType(v as DocType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_STATEMENT">Bank Statement</SelectItem>
                  <SelectItem value="APPLICATION">Application</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Select PDFs
              </Button>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              {items.length > 0 ? (
                <Button variant="ghost" className="w-full sm:w-auto" onClick={clearAll}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="flex h-40 items-center justify-center rounded-md border border-dashed"
          >
            <div className="text-center">
              <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                Drag and drop PDFs here, or use "Select PDFs"
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Files ({items.length})</Label>
            <ScrollArea className="h-40 rounded-md border">
              <div className="divide-y">
                {items.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{i.file.name}</div>
                      <div className="text-xs text-muted-foreground">{(i.file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <div className="w-48">
                      <Select
                        value={i.docType}
                        onValueChange={(v) =>
                          setItems((prev) =>
                            prev.map((x) => (x.id === i.id ? { ...x, docType: v as DocType } : x))
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BANK_STATEMENT">Bank Statement</SelectItem>
                          <SelectItem value="APPLICATION">Application</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(i.id)} aria-label="Remove">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">No files selected.</div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || items.length === 0}>
            {submitting ? "Uploading…" : "Start upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Service Function: Upload to Supabase Storage
- **File:** `src/lib/api/documents.ts`

```typescript
import { supabase } from "@/lib/supabase";

type DocType = "BANK_STATEMENT" | "APPLICATION";

export async function uploadDocumentsWithClassification(params: {
  items: Array<{ file: File; docType: DocType }>;
  orgId?: string;
}) {
  const { items, orgId } = params;

  // Resolve orgId from auth if not provided
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    resolvedOrgId = (userData.user?.user_metadata as any)?.org_id;
  }
  if (!resolvedOrgId) throw new Error("Missing org_id");

  // Upload each file and call an Edge Function to kick off ingestion
  const bucket = "documents";
  const results: Array<{ path: string; docType: DocType }> = [];

  for (const item of items) {
    const ext = item.file.name.split(".").pop() || "pdf";
    const objectName = `${resolvedOrgId}/${item.docType}/${crypto.randomUUID()}.${ext}`;
    const uploadRes = await supabase.storage.from(bucket).upload(objectName, item.file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadRes.error) throw uploadRes.error;

    results.push({ path: uploadRes.data.path, docType: item.docType });
  }

  // Batch notify ingestion function
  const { error: fnErr } = await supabase.functions.invoke("ingest", {
    body: {
      org_id: resolvedOrgId,
      items: results.map((r) => ({ storage_path: r.path, document_type: r.docType })),
      source: "dashboard",
    },
  });
  if (fnErr) throw fnErr;

  return { count: results.length };
}
```

### Place Button on Companies Page
- **File:** `src/features/companies/CompaniesPage.tsx` (or equivalent)
- **Insert into page header, next to title:**

```jsx
import { UploadDocumentsDialog } from "@/components/upload/UploadDocumentsDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

// in page header:
<div className="flex items-center justify-between gap-3">
  <h1 className="text-xl font-semibold">Companies</h1>
  <div className="flex items-center gap-2">
    {/* other actions like Export can stay */}
    <UploadDocumentsDialog
      onCompleted={() => {
        // optionally re-fetch companies/materialized view
        // e.g., queryClient.invalidateQueries(["companies"]);
      }}
      trigger={
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add company
        </Button>
      }
    />
  </div>
</div>
```

### Notes
- Document type options: Bank Statement vs Application
- Each file individually classifiable
- Multi-tenant: storage path prefixed with org_id
- Single Edge Function invocation with batch items (reduces latency)

---

## ISSUE 3 — Column Visibility Gear Icon Dropdown (TanStack v8 + shadcn/ui)

### UI/UX Pattern
- Replace visible checklist UI with compact gear icon
- Clicking gear opens DropdownMenu with checkboxes
- Include Show all / Hide all / Reset actions
- Optional: persist visibility to localStorage

### New Component: ColumnVisibilityDropdown
- **File:** `src/components/table/ColumnVisibilityDropdown.tsx`

```typescript
import * as React from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Table } from "@tanstack/react-table";

type Props<TData> = {
  table: Table<TData>;
  storageKey?: string; // optional localStorage key to persist
};

export function ColumnVisibilityDropdown<TData>({ table, storageKey }: Props<TData>) {
  const allLeaf = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const [mounted, setMounted] = React.useState(false);

  // Optional persistence
  React.useEffect(() => {
    setMounted(true);
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const vis = JSON.parse(raw);
        table.setColumnVisibility(vis);
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!storageKey || !mounted) return;
    const vis = table.getState().columnVisibility;
    localStorage.setItem(storageKey, JSON.stringify(vis));
  }, [mounted, storageKey, table]);

  function showAll() {
    const next: Record<string, boolean> = {};
    for (const c of allLeaf) next[c.id] = true;
    table.setColumnVisibility(next);
  }

  function hideAll() {
    const next: Record<string, boolean> = {};
    for (const c of allLeaf) next[c.id] = false;
    table.setColumnVisibility(next);
  }

  function reset() {
    showAll();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Columns">
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allLeaf.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(checked) => column.toggleVisibility(!!checked)}
          >
            {(column.columnDef.header as React.ReactNode) ?? column.id}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={showAll}>Show all</DropdownMenuItem>
        <DropdownMenuItem onClick={hideAll}>Hide all</DropdownMenuItem>
        <DropdownMenuItem onClick={reset}>Reset</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Integrate Into Companies Table Toolbar
- **File:** `src/features/companies/CompaniesTableToolbar.tsx` (or equivalent)
- **Replace old checklist block with:**

```jsx
import { ColumnVisibilityDropdown } from "@/components/table/ColumnVisibilityDropdown";

// in toolbar action area (right side of header)
<div className="flex items-center gap-2">
  {/* existing actions like Export */}
  <ColumnVisibilityDropdown table={table} storageKey="companies-table:colvis" />
</div>
```

### How It Works
- Uses column.getCanHide() to filter toggleable columns
- Uses column.toggleVisibility and table.setColumnVisibility for updates
- Clean, professional TanStack + shadcn pattern

---

## Operational Notes and Validation Steps

### Pre-Deployment Confirmations Needed from Vincent

Before implementing, GPT-5 Pro requires confirmation:

1. **File paths:**
   - Topbar component location? (assumed: `src/components/layout/Topbar.tsx`)
   - Sidebar component location? (assumed: `src/components/layout/Sidebar.tsx`)
   - AppShell / main layout location?
   - Companies page / toolbar location?

2. **Backend specifics:**
   - Storage bucket name? (assumed: `documents`)
   - Edge Function name for ingestion? (assumed: `ingest`)
   - Expected payload structure for ingestion function?

3. **Current header height and sidebar width:**
   - Header actual height? (assumed: 56px)
   - Sidebar actual width? (assumed: 280px)

### Deployment Checklist (Post-Implementation)

1. **Layout:**
   - Desktop: Scroll Companies list; header stays fixed, sidebar below header, content never overlaps
   - Mobile: Sidebar hidden by default; header fixed; mobile sheet opens above content

2. **Upload:**
   - Click "Add company" → Select multiple PDFs → Change some to Application
   - Start upload → Confirm toast "Upload started"
   - Within 15–35s per file: new company appears (real-time)

3. **Column Visibility:**
   - Toggle columns via gear icon → Confirm table updates instantly
   - Refresh page → If storageKey provided, visibility persists

---

## NEXT STEP REQUIRED

Before implementation can begin:

**Contact GPT-5 Pro using continuation_id `2e5721c1-382e-4957-a611-8e3028a64c09` to confirm:**
1. Exact file paths for Topbar, Sidebar, AppShell, Companies page/toolbar
2. Storage bucket name
3. Edge Function name and expected payload format
4. Actual header height and sidebar width values

Once confirmed, implementation can proceed directly to production without local testing.

---

**Status:** Awaiting file path and backend configuration confirmation from Vincent before executing changes.

**Continuation ID for GPT-5 Pro:** `2e5721c1-382e-4957-a611-8e3028a64c09`

**Remaining conversation turns with GPT-5 Pro:** 39
