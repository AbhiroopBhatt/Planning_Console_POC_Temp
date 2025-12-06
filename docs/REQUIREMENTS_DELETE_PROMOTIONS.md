# Requirements Document: Delete Promotions Feature

## Overview
Add the ability to delete entire promotions from the plan page with support for multiselect deletion. The delete action should be subtle and unobtrusive in the UI.

## Requirements

### 1. Backend API

#### 1.1 Delete Single Promotion Endpoint
- **Endpoint**: `DELETE /api/promotions/fact/:promotionId`
- **Description**: Deletes all records in Fact_Promotions table that have the specified Promotion_ID
- **Parameters**: 
  - `promotionId` (path parameter): The Promotion_ID to delete
- **Response**: 
  - Success: `{ success: true, data: { records_deleted: number, message: string } }`
  - Error: `{ success: false, error: string }`
- **Behavior**:
  - Delete all records from Fact_Promotions where Promotion_ID = promotionId
  - Return count of deleted records
  - Handle errors gracefully

#### 1.2 Delete Multiple Promotions Endpoint
- **Endpoint**: `DELETE /api/promotions/fact/bulk`
- **Description**: Deletes all records for multiple promotions
- **Request Body**: 
  ```json
  {
    "promotionIds": [1, 2, 3]
  }
  ```
- **Response**: 
  - Success: `{ success: true, data: { promotions_deleted: number, total_records_deleted: number, message: string } }`
  - Error: `{ success: false, error: string }`
- **Behavior**:
  - Delete all records from Fact_Promotions where Promotion_ID IN (promotionIds)
  - Return count of promotions and total records deleted
  - Validate that promotionIds array is provided and non-empty

### 2. Frontend UI

#### 2.1 Multiselect Checkboxes
- **Location**: First column of the promotions table (before ID column)
- **Behavior**:
  - Each row has a checkbox
  - Checkbox should be subtle (small size, low visual weight)
  - Clicking checkbox selects/deselects that promotion
  - Checkbox click should NOT trigger row navigation
- **Visual Design**:
  - Small checkbox (w-4 h-4)
  - Subtle styling (gray border, minimal visual impact)
  - Hover state for better UX

#### 2.2 Select All Checkbox
- **Location**: Table header, first column
- **Behavior**:
  - Selects/deselects all promotions on current page
  - Shows indeterminate state when some (but not all) are selected
  - Updates when filters/pagination change

#### 2.3 Delete Action Button
- **Location**: Table header controls area (top right, near pagination controls)
- **Visual Design**:
  - Small, subtle button
  - Text: "Delete" or icon-only (Trash icon)
  - Disabled state when no promotions are selected
  - Small size (text-xs, padding: px-2 py-1)
  - Red/destructive color when enabled, gray when disabled
- **Behavior**:
  - Only visible/enabled when at least one promotion is selected
  - Shows count of selected promotions: "Delete (3)"
  - Opens confirmation dialog before deletion
  - Shows loading state during deletion
  - Refreshes data after successful deletion
  - Shows error message if deletion fails

#### 2.4 Confirmation Dialog
- **Trigger**: When delete button is clicked
- **Content**:
  - Title: "Delete Promotions?"
  - Message: "Are you sure you want to delete {count} promotion(s)? This action cannot be undone."
  - Actions:
    - Cancel button (secondary)
    - Delete button (destructive/red)
- **Behavior**:
  - Prevents accidental deletions
  - Shows count of promotions to be deleted

#### 2.5 Selection State Management
- **State**:
  - Track selected promotion IDs in component state
  - Clear selection when filters change
  - Persist selection across pagination (if on same page)
- **Visual Feedback**:
  - Selected rows should have subtle background highlight
  - Selected count displayed near delete button

### 3. User Experience

#### 3.1 Selection Workflow
1. User clicks checkboxes to select promotions
2. Delete button becomes enabled and shows count
3. User clicks delete button
4. Confirmation dialog appears
5. User confirms deletion
6. Loading state shown
7. Success message displayed
8. Table refreshes with updated data
9. Selection cleared

#### 3.2 Error Handling
- Network errors: Show error message, keep selection
- Validation errors: Show specific error message
- Partial failures: Show which promotions failed (if applicable)

#### 3.3 Accessibility
- Keyboard navigation support for checkboxes
- ARIA labels for screen readers
- Focus management in confirmation dialog

### 4. Technical Considerations

#### 4.1 Data Consistency
- Ensure all records with same Promotion_ID are deleted atomically
- Use database transactions if needed
- Handle foreign key constraints if any

#### 4.2 Performance
- Bulk delete should be efficient for large numbers of records
- Consider adding database indexes on Promotion_ID if not present
- Optimize query for deleting multiple promotions

#### 4.3 State Management
- Use React Query for optimistic updates and cache invalidation
- Invalidate promotions query after successful deletion
- Handle loading and error states properly

## Implementation Checklist

### Backend
- [ ] Add deleteFactPromotion endpoint to promotionsController
- [ ] Add deleteFactPromotionsBulk endpoint to promotionsController
- [ ] Add routes for delete endpoints
- [ ] Add error handling and validation
- [ ] Add logging for delete operations

### Frontend
- [ ] Add checkbox column to promotions table
- [ ] Add select all checkbox in table header
- [ ] Add selection state management
- [ ] Add delete button to table header
- [ ] Add confirmation dialog component
- [ ] Implement delete API calls
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add success notifications
- [ ] Update React Query cache after deletion
- [ ] Add keyboard navigation support
- [ ] Add ARIA labels for accessibility

## Testing Considerations

1. Test single promotion deletion
2. Test multiple promotion deletion
3. Test with no promotions selected (button disabled)
4. Test confirmation dialog cancel
5. Test error scenarios (network errors, invalid IDs)
6. Test selection persistence across pagination
7. Test select all functionality
8. Test with filtered results
9. Test accessibility with keyboard navigation
10. Test with screen readers
