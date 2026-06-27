const fs = require('fs');

let code = fs.readFileSync('apps/web-pc/src/components/themes/ModernTheme/ModernTheme.jsx', 'utf8');

// 1. Import startTransition
code = code.replace(
  /import React, \{ (.*?) \} from 'react';/,
  `import React, { $1, startTransition } from 'react';`
);

// 2. Wrap handleCategoryChange logic
code = code.replace(
  /const handleCategoryChange = \(type, categoryId\) => \{[\s\S]*?if \(type === 'series'\) setActiveSeriesCategoryId\(categoryId\);\n    \};/,
  `const handleCategoryChange = (type, categoryId) => {
      if (userData.lockedCategories.includes(categoryId) && !isSessionUnlocked) {
        setPinPromptCallback(() => () => {
          useAppStore.getState().setIsSessionUnlocked(true);
          startTransition(() => {
            if (type === 'live') setActiveLiveCategoryId(categoryId);
            if (type === 'vod') setActiveVodCategoryId(categoryId);
            if (type === 'series') setActiveSeriesCategoryId(categoryId);
          });
        });
        return;
      }
      startTransition(() => {
        if (type === 'live') setActiveLiveCategoryId(categoryId);
        if (type === 'vod') setActiveVodCategoryId(categoryId);
        if (type === 'series') setActiveSeriesCategoryId(categoryId);
      });
    };`
);

fs.writeFileSync('apps/web-pc/src/components/themes/ModernTheme/ModernTheme.jsx', code);
console.log('ModernTheme updated with startTransition!');
