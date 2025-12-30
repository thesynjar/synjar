export type MobileTab = 'available' | 'selected';

interface MobileTabsProps {
  activeTab: MobileTab;
  selectedCount: number;
  onTabChange: (tab: MobileTab) => void;
}

export function MobileTabs({ activeTab, selectedCount, onTabChange }: MobileTabsProps) {
  return (
    <div className="md:hidden mb-4">
      <div className="flex bg-slate-800 rounded-lg p-1" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'available'}
          onClick={() => onTabChange('available')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'available'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Available
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'selected'}
          onClick={() => onTabChange('selected')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'selected'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Selected ({selectedCount})
        </button>
      </div>
    </div>
  );
}
