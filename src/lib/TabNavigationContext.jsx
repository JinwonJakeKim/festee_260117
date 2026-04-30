/**
 * TabNavigationContext
 * 
 * 각 탭의 히스토리 스택을 전역으로 관리합니다.
 * Layout.jsx에서 Provider를 렌더링하고, 
 * 각 페이지에서 useTabNavigation() 훅으로 탭 인식 뒤로가기를 사용합니다.
 */
import React, { createContext, useContext, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export const TAB_ROUTES = {
  home: {
    root: createPageUrl("Home"),
    children: [
      createPageUrl("FestivalDetail"),
      createPageUrl("FestivalMore"),
      createPageUrl("Search"),
      createPageUrl("RankerDetail"),
      createPageUrl("FestivalVenueMap"),
      createPageUrl("PostDetail"),
      createPageUrl("GoTogetherDetail"),
      createPageUrl("Notifications"),
      createPageUrl("Messages"),
      createPageUrl("MessageDetail"),
      createPageUrl("FeedbackForm"),
      createPageUrl("FeedbackDetail"),
      createPageUrl("UserProfile"),
    ],
  },
  map: {
    root: createPageUrl("FestivalMap"),
    children: [],
  },
  catch: {
    root: createPageUrl("Catch"),
    children: [createPageUrl("NearbyCatch")],
  },
  community: {
    root: createPageUrl("Community"),
    children: [createPageUrl("CreatePost"), createPageUrl("PostDetail"), createPageUrl("GoTogetherDetail")],
  },
  my: {
    root: createPageUrl("MyFestee"),
    children: [
      createPageUrl("Settings"),
      createPageUrl("MyLikes"),
      createPageUrl("MyComments"),
      createPageUrl("MyRecommendations"),
      createPageUrl("SelectCity"),
      createPageUrl("MyCatches"),
      createPageUrl("MyFollowers"),
      createPageUrl("MyFollowing"),
      createPageUrl("AccountManagement"),
    ],
  },
};

export const getTabForPath = (pathname) => {
  for (const [tabKey, tabConfig] of Object.entries(TAB_ROUTES)) {
    if (pathname === tabConfig.root || pathname.startsWith(tabConfig.root + "/") || pathname.startsWith(tabConfig.root + "?")) {
      return tabKey;
    }
    if (tabConfig.children.some(c => pathname === c || pathname.startsWith(c + "/") || pathname.startsWith(c + "?"))) {
      return tabKey;
    }
  }
  return null;
};

const TabNavigationContext = createContext(null);

export function TabNavigationProvider({ children }) {
  // 각 탭의 히스토리 스택
  const tabStacks = useRef({
    home: [createPageUrl("Home")],
    map: [createPageUrl("FestivalMap")],
    catch: [createPageUrl("Catch")],
    community: [createPageUrl("Community")],
    my: [createPageUrl("MyFestee")],
  });

  // 현재 활성 탭 추적
  const activeTabRef = useRef("home");

  const pushToStack = useCallback((pathname) => {
    const tab = getTabForPath(pathname);
    if (!tab) return;

    activeTabRef.current = tab;
    const stack = tabStacks.current[tab];
    const top = stack[stack.length - 1];

    if (top !== pathname) {
      const existingIdx = stack.indexOf(pathname);
      if (existingIdx !== -1) {
        tabStacks.current[tab] = stack.slice(0, existingIdx + 1);
      } else {
        tabStacks.current[tab] = [...stack, pathname];
      }
    }
  }, []);

  const getActiveTab = useCallback(() => activeTabRef.current, []);

  const getStack = useCallback((tab) => tabStacks.current[tab] || [], []);

  const popStack = useCallback((tab) => {
    const stack = tabStacks.current[tab];
    if (stack.length > 1) {
      const newStack = stack.slice(0, -1);
      tabStacks.current[tab] = newStack;
      return newStack[newStack.length - 1];
    }
    return null;
  }, []);

  const resetTabStack = useCallback((tab) => {
    tabStacks.current[tab] = [TAB_ROUTES[tab].root];
  }, []);

  const getLastTabPath = useCallback((tab) => {
    const stack = tabStacks.current[tab];
    return stack[stack.length - 1] || TAB_ROUTES[tab].root;
  }, []);

  return (
    <TabNavigationContext.Provider value={{
      pushToStack,
      getActiveTab,
      getStack,
      popStack,
      resetTabStack,
      getLastTabPath,
      tabStacks,
    }}>
      {children}
    </TabNavigationContext.Provider>
  );
}

export function useTabNavigation() {
  const ctx = useContext(TabNavigationContext);
  const navigate = useNavigate();

  // 탭 스택 기반 뒤로가기
  const goBack = useCallback((fallbackPath) => {
    if (!ctx) {
      navigate(fallbackPath || -1);
      return;
    }

    const activeTab = ctx.getActiveTab();
    const prevPath = ctx.popStack(activeTab);

    if (prevPath) {
      navigate(prevPath, { replace: true });
    } else if (fallbackPath) {
      navigate(fallbackPath, { replace: true });
    } else {
      navigate(TAB_ROUTES[activeTab]?.root || createPageUrl("Home"), { replace: true });
    }
  }, [ctx, navigate]);

  return { goBack };
}

export default TabNavigationContext;