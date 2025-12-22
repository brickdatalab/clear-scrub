# ClearScrub Dashboard - Discovery & Fix Plan

## Components NOT Part of shadcn Library

1. **Dashboard Layout Structure** - The overall page layout combining top bar, sidebar, and main content area with proper positioning is custom code, not a shadcn component (shadcn provides individual pieces but not the integrated layout).

2. **Top Navigation Bar** - The integrated header component with logo, search input, notification bell, and user avatar dropdown is custom-built (shadcn has individual components like Input, Avatar, Button, but not this pre-built navigation bar).

3. **Column Visibility Interface** - The current implementation showing checkboxes for column visibility appears to be custom (shadcn has Checkbox and Popover components, but not this specific pattern for table column toggling).

## Issue #1: Top Bar and Sidebar Spacing/Layout Problems

**Problem:** The top dashboard bar is colliding with the sidebar menu. There are significant spacing and formatting issues where the sidebar overlaps or improperly aligns with the top navigation bar.

**What needs fixing:**
- Proper spacing between sidebar and top bar
- Ensure sidebar doesn't overlap with top bar elements
- Fix layout so both components have proper z-index and positioning
- Ensure responsive behavior maintains proper spacing

## Issue #2: Missing "Add Company" Button

**Problem:** There is no "Add Company" button visible on the Companies page to allow users to upload new documents.

**Required functionality:**
- Add prominent "Add Company" button to Companies page
- Button should trigger multi-file upload dialog for PDF documents
- Upload interface must include classification selector for each file:
  - Bank statement
  - Application document
- Support multiple file upload simultaneously
- Each file should be individually classifiable during upload

## Issue #3: Column Visibility UI is Unprofessional

**Problem:** The current column visibility interface (checkboxes showing "name", "file_status", "created", "last_activity") looks unprofessional and poorly designed.

**Required changes:**
- Replace current checkbox interface with a gear/settings icon
- Icon should have configure bars (settings icon style)
- Clicking gear icon should open a proper dropdown/popover
- Dropdown should contain the column visibility checkboxes in a clean, organized layout
- Should follow professional dashboard patterns for column configuration

