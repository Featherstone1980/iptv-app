import React from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import './CategorySelector.css';

const CategorySelector = ({ categories, activeCategoryId, onSelectCategory, compact = false }) => {
  const { ref } = useFocusable();

  if (!categories || categories.length === 0) return null;

  return (
    <div className={`category-selector-container ${compact ? 'compact' : ''}`}>
      <div className="category-dropdown-wrapper">
        <select 
          ref={ref}
          className="category-dropdown"
          value={activeCategoryId || ''}
          onChange={(e) => onSelectCategory(e.target.value)}
        >
          {categories.map(cat => (
            <option key={cat.category_id} value={cat.category_id}>
              {cat.category_name}
            </option>
          ))}
        </select>
        <div className="dropdown-icon">▼</div>
      </div>
    </div>
  );
};

export default CategorySelector;
