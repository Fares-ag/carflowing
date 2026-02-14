# CarFlow Platform Development Guidelines

## Library and Package Standards

### Charting and Data Visualization
- **Primary Library:** `recharts` (v2.12.7+)
- Use Recharts for all charts, graphs, and data visualizations
- Consistent styling and theming across all apps
- All apps should have Recharts installed for consistency

### Routing
- **Primary Library:** `react-router-dom` (v7.11.0+)
- Use React Router for all navigation and routing needs
- Consistent routing patterns across customer, dealer, and admin apps

### General Principles
1. **Consistency First**: Use the same libraries across all apps (customer, dealer, admin)
2. **When Adding New Features**: 
   - Check if existing libraries can be used
   - If a new library is needed, add it to all relevant apps for consistency
   - Document new libraries in this file
3. **Package Management**: 
   - Keep versions consistent across apps when possible
   - Update packages regularly for security patches

## App Structure

### Customer App (`apps/customer`)
- Port: 5173
- Main features: Homepage, Dashboard, Rentals, Favorites, Requests, Subscription & Billing
- Libraries: react, react-dom, react-router-dom, recharts

### Dealer App (`apps/dealer`)
- Port: 5175
- Main features: Dashboard, Analytics (with tabs: Overview, Revenue, Customers, Vehicles, Insights)
- Libraries: react, react-dom, react-router-dom, recharts

### Admin App (`apps/admin`)
- Port: (TBD)
- Libraries: react, react-dom, react-router-dom, recharts (recommended)

## Chart Implementation Standards

When creating charts, use Recharts with the following patterns:

```tsx
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts'

// Line Chart Example
<ResponsiveContainer width="100%" height={280}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
    <XAxis dataKey="month" stroke="#666" tick={{ fontSize: 12 }} />
    <YAxis stroke="#666" tick={{ fontSize: 12 }} />
    <Tooltip 
      contentStyle={{ 
        backgroundColor: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: '4px'
      }}
    />
    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} />
  </LineChart>
</ResponsiveContainer>
```

## Color Palette

Primary colors used across the platform:
- Purple Primary: `#6366f1`
- Purple Secondary: `#8b5cf6`
- Success/Positive: `#10b981` or `#00a63e`
- Error/Warning: `#dc2626` or `#991b1b`
- Text Primary: `#333` or `#0a0a0a`
- Text Secondary: `#666` or `#4a5565`
- Border: `#e5e5e5`
- Background: `#f5f5f5` or `#f9fafb`

## Future Considerations

When adding new features, consider these libraries (add to ALL relevant apps):
1. **Forms**: `react-hook-form` + `zod` for form management and validation
2. **UI Components**: `lucide-react` or `react-icons` for consistent icons
3. **Date Handling**: `date-fns` for date manipulation and formatting
4. **State Management**: React Context API (default) or `zustand` for complex global state
5. **API Client**: `axios` or `@tanstack/react-query` for API calls and caching
6. **Notifications**: `react-hot-toast` or `sonner` for toast notifications
7. **Modal/Dialog**: Consider `@radix-ui/react-dialog` for accessible modals

### Important Rules:
- ✅ **ALWAYS** add new libraries to ALL apps (customer, dealer, admin) for consistency
- ✅ Use the same version numbers across all apps
- ✅ Document new libraries in this file
- ✅ Follow the existing code patterns and styling
- ❌ **NEVER** use different libraries for the same purpose in different apps
