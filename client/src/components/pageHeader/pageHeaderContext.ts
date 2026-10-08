import { createContext } from 'react';

/**
 * Whether PageHeader draws its icon, title and subtitle. The admin shell already shows where you are
 * (header label and breadcrumb), so it turns this off and every admin page gets its space back for
 * the content. Pages outside the admin shell keep the full header.
 */
export const PageHeaderTitleContext = createContext(true);
