import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import HomeHeaderActions from "@/components/HomeHeaderActions";

export default function DesktopHeader({ navItems, currentTabKey, onTabClick, paddingTop }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-[9999] bg-black/90 backdrop-blur-lg border-b border-gray-800"
      style={{ paddingTop }}
    >
      <div className="w-full flex items-center gap-12" style={{ height: '4.5rem', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}>
        {/* Logo */}
        <Link to={createPageUrl("Home")} className="flex items-center shrink-0 cursor-pointer">
          <span
            className="text-3xl font-black tracking-tight"
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

        {/* Horizontal nav */}
        <nav className="flex items-center gap-12 shrink-0">
          {navItems.map((item) => {
            const isActive = currentTabKey === item.key;
            const Icon = item.icon;
            return (
              <a
                key={item.key}
                href={item.url}
                onClick={(e) => onTabClick(e, item.key, item.url)}
                className="relative flex items-center gap-2.5 text-lg font-medium transition-colors group py-6"
              >
                <Icon
                  className={`w-6 h-6 transition-colors ${
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

        {/* 우측 액션 (메시지/알림/언어) */}
        <div className="ml-auto">
          <HomeHeaderActions variant="desktop" />
        </div>
      </div>
    </header>
  );
}