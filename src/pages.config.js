/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccountManagement from './pages/AccountManagement';
import AdminAdForm from './pages/AdminAdForm';
import AdminDashboard from './pages/AdminDashboard';
import AdminEventbrite from './pages/AdminEventbrite';
import AdminFestivalExtract from './pages/AdminFestivalExtract';
import AdminFestivalForm from './pages/AdminFestivalForm';
import AdminTourAPI from './pages/AdminTourAPI';
import AdminUrlExtraction from './pages/AdminUrlExtraction';
import Catch from './pages/Catch';
import Community from './pages/Community';
import CreatePost from './pages/CreatePost';
import FeedbackDetail from './pages/FeedbackDetail';
import FeedbackForm from './pages/FeedbackForm';
import FestivalDetail from './pages/FestivalDetail';
import FestivalMap from './pages/FestivalMap';
import FestivalMore from './pages/FestivalMore';
import FestivalVenueMap from './pages/FestivalVenueMap';
import GoTogetherDetail from './pages/GoTogetherDetail';
import Home from './pages/Home';
import MessageDetail from './pages/MessageDetail';
import Messages from './pages/Messages';
import MyCatches from './pages/MyCatches';
import MyComments from './pages/MyComments';
import MyFestee from './pages/MyFestee';
import MyFollowers from './pages/MyFollowers';
import MyFollowing from './pages/MyFollowing';
import MyLikes from './pages/MyLikes';
import MyRecommendations from './pages/MyRecommendations';
import NearbyCatch from './pages/NearbyCatch';
import Notifications from './pages/Notifications';
import PostDetail from './pages/PostDetail';
import RankerDetail from './pages/RankerDetail';
import Search from './pages/Search';
import SelectCity from './pages/SelectCity';
import Settings from './pages/Settings';
import UserProfile from './pages/UserProfile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountManagement": AccountManagement,
    "AdminAdForm": AdminAdForm,
    "AdminDashboard": AdminDashboard,
    "AdminEventbrite": AdminEventbrite,
    "AdminFestivalExtract": AdminFestivalExtract,
    "AdminFestivalForm": AdminFestivalForm,
    "AdminTourAPI": AdminTourAPI,
    "AdminUrlExtraction": AdminUrlExtraction,
    "Catch": Catch,
    "Community": Community,
    "CreatePost": CreatePost,
    "FeedbackDetail": FeedbackDetail,
    "FeedbackForm": FeedbackForm,
    "FestivalDetail": FestivalDetail,
    "FestivalMap": FestivalMap,
    "FestivalMore": FestivalMore,
    "FestivalVenueMap": FestivalVenueMap,
    "GoTogetherDetail": GoTogetherDetail,
    "Home": Home,
    "MessageDetail": MessageDetail,
    "Messages": Messages,
    "MyCatches": MyCatches,
    "MyComments": MyComments,
    "MyFestee": MyFestee,
    "MyFollowers": MyFollowers,
    "MyFollowing": MyFollowing,
    "MyLikes": MyLikes,
    "MyRecommendations": MyRecommendations,
    "NearbyCatch": NearbyCatch,
    "Notifications": Notifications,
    "PostDetail": PostDetail,
    "RankerDetail": RankerDetail,
    "Search": Search,
    "SelectCity": SelectCity,
    "Settings": Settings,
    "UserProfile": UserProfile,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};