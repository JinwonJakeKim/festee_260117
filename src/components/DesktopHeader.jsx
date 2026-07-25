import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Search } from "lucide-react";
import { motion } from "framer-motion";

export default function DesktopHeader({ navItems, currentTabKey, onTabClick, paddingTop }) {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");

  const onSearchSubmit = (e) => {
    e.preventDefault();
    navigate(query.trim()
      ? createPageUrl(`Search?q=${encodeURIComponent(query.trim())}`)
      : createPageUrl("Search"));
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-[9999] bg-black/90 backdrop-blur-lg border-b border-gray-800"
      style={{ paddingTop }}
    >
      {/* Row 1: Main bar - logo, search pill, utilities */}
      <div
        className="max-w-screen-xl mx-auto px-6 flex items-center gap-6"
        style={{ height: '4rem' }}
      >
        <Link to={createPageUrl("Home")} className="flex items-center shrink-0 cursor-pointer">
          <span
            className="text-2xl font-black tracking-tight"
            style={{
              background: 'linear-gradient(90deg, #00C846 0%, #78D800 15%, #FFD000 30%, #FF9500 45%, #FF4400 60%, #FF0070 75%, #9000FF 88%, #0088FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            FESTEE
          </span>
        </Link>

        {/* Search pill */}
        <form onSubmit={onSearchSubmit} className="flex-1 max-w-2xl">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="축제, 도시, 키워드 검색"
              className="w-full h-11 pl-5 pr-12 rounded-full bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center transition-colors"
            >
              <Search className="w-4 h-4 text-black" />
            </button>
          </div>
        </form>

        <div className="hidden lg:flex items-center shrink-0">
          <span className="text-sm text-gray-400">세상의 모든 축제</span>
        </div>
      </div>

      {/* Row 2: Category sub-menu */}
      <div className="max-w-screen-xl mx-auto px-6">
        <nav className="flex items-center gap-8 h-12 overflow-x-auto scrollbar-hide">
          {navItems.map((item) => {
            const isActive = currentTabKey === item.key;
            const Icon = item.icon;
            return (
              <a
                key={item.key}
                href={item.url}
                onClick={(e) => onTabClick(e, item.key, item.url)}
                className="relative flex items-center gap-1.5 text-sm font-medium transition-colors group shrink-0 py-3"
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'
                  }`}
                />
                <span
                  className={`transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-gray-400 group-hover:text-white'
                  }`}
                >
                  {item.name}
                </span>
                {isActive && (
                  <motion.span
                    layoutId="desktopNavUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full"
                  />
                )}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}