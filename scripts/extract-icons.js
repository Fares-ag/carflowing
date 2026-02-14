/**
 * Script to extract and download icons from Figma designs
 * This script will be used to organize all icons from the Figma designs
 */

// Icon URLs extracted from Figma designs
const iconUrls = {
  // Dashboard icons
  dashboard: {
    logo: "https://www.figma.com/api/mcp/asset/e55c844f-3c92-482b-9827-f6fdbc44e86f",
    dashboardIcon: "https://www.figma.com/api/mcp/asset/5a1ba687-b67b-4681-aed8-4aa48e65a416",
    analyticsIcon: "https://www.figma.com/api/mcp/asset/4afaa217-c4bc-4030-b2f4-4e899aa85f68",
    inventoryIcon: "https://www.figma.com/api/mcp/asset/c17cd6a8-a014-4f24-bfdf-cad76b26871c",
    leadsIcon: "https://www.figma.com/api/mcp/asset/fc181918-83ca-4a0b-a0d5-f44ef1b5c5a7",
    notificationsIcon: "https://www.figma.com/api/mcp/asset/bcb0b280-d621-42f2-84ba-387ba26ecb4a",
    subscriptionIcon: "https://www.figma.com/api/mcp/asset/6f834cfd-d908-48ae-9749-24fcf099b57b",
    settingsIcon: "https://www.figma.com/api/mcp/asset/b1eb9b9f-6a9d-443c-8703-be1b2adc2052",
    logoutIcon: "https://www.figma.com/api/mcp/asset/d59019a2-bc08-4470-9e0e-09e01e5fa3d0",
    editIcon: "https://www.figma.com/api/mcp/asset/c84d6675-6141-45ca-b81a-b4f9fad4ccfd",
    backIcon: "https://www.figma.com/api/mcp/asset/b6aabe39-9c6d-4271-9ba9-fbd54515555d",
    homeIcon: "https://www.figma.com/api/mcp/asset/97b3fa69-d048-4f97-b09b-f33814689894",
    revenueIcon: "https://www.figma.com/api/mcp/asset/1deea0cb-2081-4522-aa14-f0d76a1d350b",
    bookingsIcon: "https://www.figma.com/api/mcp/asset/92c7b839-700e-4a6b-88ca-319d014eca83",
    vehiclesIcon: "https://www.figma.com/api/mcp/asset/cdcd8b36-3f2e-4348-815a-054be572f847",
    customersIcon: "https://www.figma.com/api/mcp/asset/8b90d624-c207-4fcf-bd16-1321fc424899",
  },
  // Leads page icons
  leads: {
    addIcon: "https://www.figma.com/api/mcp/asset/...", // Will be extracted
    searchIcon: "https://www.figma.com/api/mcp/asset/...",
    callIcon: "https://www.figma.com/api/mcp/asset/...",
    emailIcon: "https://www.figma.com/api/mcp/asset/...",
    manageIcon: "https://www.figma.com/api/mcp/asset/...",
    closeIcon: "https://www.figma.com/api/mcp/asset/...",
  }
};

// Export for use in the project
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { iconUrls };
}
