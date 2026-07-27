import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import HomeHeaderActions from "@/components/HomeHeaderActions";

export default function DesktopHeader({ navItems, currentTabKey, onTabClick, paddingTop }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-[9999] bg-black/75 backdrop-blur-xl border-b border-white/[0.06]"
      style={{ paddingTop }}
    >
      <div
        className="mx-auto max-w-5xl flex items-center justify-between px-10 lg:px-14"
        style={{ height: '3.75rem' }}
      >
        {/* Logo */}
        <Link to={createPageUrl("Home")} className="flex items-center shrink-0 cursor-pointer">
          <span
            className="text-3xl font-bold leading-none tracking-[-0.04em]"
            style={{
              background: 'linear-gradient(92deg, #00C846 0%, #78D800 14%, #FFD000 28%, #FF9500 42%, #FF4400 56%, #FF0070 72%, #9000FF 86%, #0088FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            FESTEE
          </span>
        </Link>

        {/* Center nav — segmented pill */}
        <nav className="flex items-center gap-0.5 bg-white/[0.035] rounded-full p-1 border border-white/[0.06]">
          {navItems.map((item) => {
            const isActive = currentTabKey === item.key;
            const Icon = item.icon;
            return (
              <a
                key={item.key}
                href={item.url}
                onClick={(e) => onTabClick(e, item.key, item.url)}
                className="relative flex items-center gap-1.5 px-4 lg:px-5 py-2 rounded-full text-base font-medium transition-colors cursor-pointer"
              >
                {isActive && (
                  <motion.span
                    layoutId="desktopNavPill"
                    className="absolute inset-0 bg-cyan-400/15 border border-cyan-400/30 rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon
                  className={`relative w-[17px] h-[17px] transition-colors ${
                    isActive ? 'text-cyan-300' : 'text-gray-500'
                  }`}
                />
                <span
                  className={`relative transition-colors ${
                    isActive ? 'text-cyan-200' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {item.name}
                </span>
              </a>
            );
          })}
        </nav>

        {/* 우측 액션 */}
        <div className="shrink-0">
          <HomeHeaderActions variant="desktop" />
        </div>
      </div>
    </header>
  );
}