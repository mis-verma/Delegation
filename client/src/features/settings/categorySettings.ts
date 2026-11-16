export interface CategorySettings {
  fillHead: boolean;
  defaultDepartmentId: string;
  defaultHours: string;
}

const KEY = 'karya.categorySettings';

export const DEFAULT_CATEGORY_SETTINGS: CategorySettings = { fillHead: true, defaultDepartmentId: '', defaultHours: '' };

export const readCategorySettings = (): CategorySettings => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CATEGORY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CategorySettings>;
    return {
      fillHead: parsed.fillHead !== false,
      defaultDepartmentId: typeof parsed.defaultDepartmentId === 'string' ? parsed.defaultDepartmentId : '',
      defaultHours: typeof parsed.defaultHours === 'string' ? parsed.defaultHours : '',
    };
  } catch {
    return DEFAULT_CATEGORY_SETTINGS;
  }
};

export const writeCategorySettings = (settings: CategorySettings): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    return;
  }
};
