import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";

import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "./redux/authSlice";
import Login from "./components/Login";
import "react-toastify/dist/ReactToastify.css";
import { jwtDecode } from "jwt-decode";
import Dashboard from "./components/Dashboard";
//import WelcomePage from "./components/WelcomePage";
import Prediction from "./components/Prediction";
import PredictionDetails from "./components/PredictionDetails";
import CreatePrediction from "./components/CreateNewPrediction";
import ProtectedRoute from "./components/ProtectedRoute";
import "leaflet/dist/leaflet.css";
import "./App.css"; // Import CSS for header and footer
import AreaList from "./components/AreaList";
import InteractiveMap from "./components/InteractiveMap";
import UserList from "./components/UserList";
import UserProfile from "./components/UserProfile";
import Jobs from "./components/Jobs";
import AdminStats from "./components/AdminStats";
import EmailList from "./components/EmailList";
import EmailSubscription from "./components/EmailSubscription";
import UnsubscribePage from "./components/UnsubscribePage";
import SwaggerViewer from "./components/SwaggerViewer";
import ForgotPassword from "./components/ForgotPassword";
import MLModelManagement from "./components/MLModelManagement";
import { useTranslation } from "react-i18next";
import LanguageSwitch from "./components/LanguageSwitch";
import {
  Layout,
  Menu,
  Button,
  theme,
  Typography,
  Space,
  message,
  Row,
  Col,
  Grid,
  Dropdown,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ArrowRightOutlined,
  DashboardOutlined,
  AreaChartOutlined,
  UserOutlined,
  PlusCircleOutlined,
  LogoutOutlined,
  GlobalOutlined,
  ProfileOutlined,
  MailOutlined,
  EnvironmentOutlined,
  ApiOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;

const App = () => {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();
  const { token, role } = useSelector((state) => state.auth);

  // Get user name from token with character limit based on screen size
  // iPad (md): 25 chars, larger screens: 50 chars
  const screens = useBreakpoint();
  const userName = token
    ? (() => {
      try {
        const decodedToken = jwtDecode(token);
        const name = decodedToken.name || decodedToken.username || "";
        if (!name) return "";
        // iPad (md) and up: show name, limit based on screen size
        console.log("name", name);
        if (screens.md || screens.lg || screens.xl || screens.xxl) {
          const maxLength = screens.md && !screens.lg ? 25 : 50; // iPad: 25, larger: 50
          console.log("max", maxLength);
          return name.length > maxLength
            ? name.substring(0, maxLength) + "..."
            : name;
        }
        return ""; // Don't show on small screens
      } catch (e) {
        return "";
      }
    })()
    : "";

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const switchLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const handleLogout = () => {
    dispatch(logout());
    message.success(t("logout.success"));
    navigate("/");
  };

  const isSidebarVisible =
    location.pathname !== "/interactive-map" &&
    (role === "admin" ||
      role === "expert" ||
      role === "manager" ||
      location.pathname === "/swagger");

  const getMenuItems = () => {
    // Common menu items for all users (including non-logged in)
    const commonItems = [
      {
        key: "/swagger",
        icon: <ApiOutlined />,
        label: "API Documentation",
      },
    ];

    if (role === "admin") {
      return [
        ...commonItems,
        {
          key: "/admin-stats",
          icon: <DashboardOutlined />,
          label: t("sidebar.stats"),
        },
        {
          key: "/areas",
          icon: <AreaChartOutlined />,
          label: t("sidebar.area_list"),
        },
        {
          key: "/dashboard",
          icon: <DashboardOutlined />,
          label: t("sidebar.prediction_list"),
        },
        {
          key: "/user-list",
          icon: <UserOutlined />,
          label: t("sidebar.user_list"),
        },
        {
          key: "/email-list",
          icon: <MailOutlined />,
          label: t("sidebar.email_list"),
        },
        {
          key: "/ml-models",
          icon: <ExperimentOutlined />,
          label: t("sidebar.ml_model_management"),
        },
      ];
    } else if (role === "expert") {
      return [
        ...commonItems,
        {
          key: "/dashboard",
          icon: <DashboardOutlined />,
          label: t("sidebar.prediction_list"),
        },
        {
          key: "/create-prediction",
          icon: <PlusCircleOutlined />,
          label: t("sidebar.create_prediction"),
        },
      ];
    } else if (role === "manager") {
      return [
        ...commonItems,
        {
          key: "/admin-stats",
          icon: <DashboardOutlined />,
          label: t("sidebar.stats"),
        },
        {
          key: "/dashboard",
          icon: <DashboardOutlined />,
          label: t("sidebar.prediction_list"),
        },
        {
          key: "/areas",
          icon: <AreaChartOutlined />,
          label: t("sidebar.area_list"),
        },
        ...(!jwtDecode(token).district
          ? [
            {
              key: "/user-list",
              icon: <UserOutlined />,
              label: t("sidebar.user_list"),
            },
          ]
          : []),
      ];
    }

    // For non-logged in users, only show the map
    return commonItems;
  };

  // Build user menu items dynamically based on responsive and location
  const userMenuItems = useMemo(() => {
    const isSmallScreen = screens.xs || screens.sm;
    const items = [];

    // Add Map/Management to dropdown only on small screens
    if (isSmallScreen && token) {
      if (location.pathname !== "/interactive-map") {
        items.push({
          key: "map",
          icon: <EnvironmentOutlined />,
          label: t("common.goToMap"),
          title: t("common.goToMap"),
          onClick: () => navigate("/interactive-map"),
        });
      } else {
        try {
          const decodedToken = jwtDecode(token);
          const currentTime = Math.floor(Date.now() / 1000);
          const isTokenValid =
            decodedToken.exp && decodedToken.exp > currentTime;
          if (
            isTokenValid &&
            (role === "admin" || role === "expert" || role === "manager")
          ) {
            items.push({
              key: "management",
              icon: <DashboardOutlined />,
              label: t("common.goToManagement"),
              title: t("common.goToManagement"),
              onClick: () => {
                if (role === "admin") {
                  navigate("/admin-stats");
                } else if (role === "expert") {
                  navigate("/dashboard");
                } else if (role === "manager") {
                  navigate("/admin-stats");
                }
              },
            });
          }
        } catch (e) {
          // Ignore error
        }
      }
    }

    // Add other menu items
    if (role === "admin" || role === "expert") {
      items.push({
        key: "jobs",
        icon: <ApiOutlined />,
        label: "Jobs",
        onClick: () => navigate("/jobs"),
      });
    }

    items.push(
      {
        key: "profile",
        icon: <ProfileOutlined />,
        label: t("profile.title"),
        onClick: () => navigate("/profile"),
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: t("sidebar.logout"),
        onClick: handleLogout,
      }
    );

    return items;
  }, [token, role, location.pathname, screens.xs, screens.sm, navigate, t]);

  const renderHeader = () => (
    <Header
      style={{
        background: "#007bff",
        color: "#fff",
        padding: screens.xs ? "0 12px" : "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 1,
        width: "100%",
      }}
    >
      <Row
        align="middle"
        justify="space-between"
        style={{ height: "100%", width: "100%", flexWrap: "nowrap" }}
      >
        <Col flex="none">
          {isSidebarVisible && screens.xs && (
            <Button
              type="text"
              icon={<MenuUnfoldOutlined style={{ fontSize: 24 }} />}
              onClick={() => setCollapsed(false)}
              style={{
                color: "#fff",
                width: 40,
                height: 40,
                marginRight: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          )}
        </Col>
        <Col flex="auto" style={{ minWidth: 0, overflow: "hidden" }}>
          <Title
            level={4}
            style={{
              color: "#fff",
              margin: 0,
              cursor: "pointer",
              lineHeight: "64px",
              fontSize: screens.xs ? "18px" : "24px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            onClick={() => navigate('/interactive-map')}
          >
            Prediction System
          </Title>
        </Col>
        <Col flex="none" style={{ minWidth: 0 }}>
          <Space
            size={screens.xs ? "small" : "middle"}
            style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
            wrap={false}
          >
            <Space.Compact size={screens.xs ? "small" : "middle"}>
              <Button
                type={i18n.language === "en" ? "primary" : "default"}
                style={{
                  background: i18n.language === "en" ? "#fff" : "#007bff",
                  color: i18n.language === "en" ? "#007bff" : "#fff",
                  border: "1px solid #007bff",
                }}
                onClick={() => switchLanguage("en")}
              >
                EN
              </Button>
              <Button
                type={i18n.language === "vn" ? "primary" : "default"}
                style={{
                  background: i18n.language === "vn" ? "#fff" : "#007bff",
                  color: i18n.language === "vn" ? "#007bff" : "#fff",
                  border: "1px solid #007bff",
                }}
                onClick={() => switchLanguage("vn")}
              >
                VN
              </Button>
            </Space.Compact>
            {/* Map/Management buttons - only show on iPad and larger screens, icon only with tooltip */}
            {token &&
              (screens.md || screens.lg || screens.xl || screens.xxl) &&
              location.pathname !== "/interactive-map" && (
                <Tooltip title={t("common.goToMap")}>
                  <Button
                    type="default"
                    size="middle"
                    icon={<EnvironmentOutlined />}
                    onClick={() => navigate("/interactive-map")}
                    style={{
                      background: "#007bff",
                      borderColor: "#007bff",
                      color: "#fff",
                      fontWeight: "bold",
                    }}
                  />
                </Tooltip>
              )}
            {token &&
              (screens.md || screens.lg || screens.xl || screens.xxl) &&
              location.pathname === "/interactive-map" &&
              (() => {
                try {
                  const decodedToken = jwtDecode(token);
                  const currentTime = Math.floor(Date.now() / 1000);
                  const isTokenValid =
                    decodedToken.exp && decodedToken.exp > currentTime;
                  if (
                    isTokenValid &&
                    (role === "admin" ||
                      role === "expert" ||
                      role === "manager")
                  ) {
                    return (
                      <Tooltip title={t("common.goToManagement")}>
                        <Button
                          type="default"
                          size="middle"
                          icon={<DashboardOutlined />}
                          onClick={() => {
                            if (role === "admin") {
                              navigate("/admin-stats");
                            } else if (role === "expert") {
                              navigate("/dashboard");
                            } else if (role === "manager") {
                              navigate("/admin-stats");
                            }
                          }}
                          style={{
                            background: "#007bff",
                            borderColor: "#007bff",
                            color: "#fff",
                            fontWeight: "bold",
                          }}
                        />
                      </Tooltip>
                    );
                  }
                } catch (e) {
                  return null;
                }
                return null;
              })()}
            {token ? (
              <Space>
                <Dropdown
                  menu={{ items: userMenuItems }}
                  placement="bottomRight"
                  arrow
                >
                  <Button
                    type="default"
                    size={screens.xs ? "small" : "middle"}
                    icon={<UserOutlined />}
                    style={{
                      background: "#007bff",
                      borderColor: "#007bff",
                      color: "#fff",
                      fontWeight: "bold",
                      flexShrink: 0,
                    }}
                  >
                    {userName &&
                      (screens.md ||
                        screens.lg ||
                        screens.xl ||
                        screens.xxl) && (
                        <Typography.Text
                          style={{
                            color: "#fff",
                            fontWeight: "bold",
                            fontSize:
                              screens.md && !screens.lg ? "13px" : "14px",
                            marginRight: 8,
                            maxWidth:
                              screens.md && !screens.lg ? "120px" : "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                          title={userName}
                        >
                          {userName}
                        </Typography.Text>
                      )}
                    {screens.xs || screens.sm ? "" : t("profile.title")}
                  </Button>
                </Dropdown>
              </Space>
            ) : (
              <Button
                type="primary"
                size={screens.xs ? "small" : "middle"}
                style={{
                  background: "#007bff",
                  borderColor: "#007bff",
                  color: "#fff",
                  fontWeight: "bold",
                }}
                onClick={() => navigate("/Login")}
              >
                {t("login.button")}
              </Button>
            )}
          </Space>
        </Col>
      </Row>
    </Header>
  );

  useEffect(() => {
    // Auto-collapse sidebar on mobile
    if (screens.xs) {
      setCollapsed(true);
    }
  }, [screens.xs]);

  useEffect(() => {
    // Auto-expand sidebar when leaving mobile
    if (!screens.xs && isSidebarVisible) {
      setCollapsed(false);
    }
  }, [screens.xs, isSidebarVisible]);

  // Inject custom CSS for Ant Design dropdown menu width
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      .ant-dropdown-menu {
        min-width: 180px !important;
        width: max-content !important;
        max-width: 260px;
        white-space: nowrap;
      }
      .custom-sider .ant-layout-sider-children { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {isSidebarVisible && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          breakpoint="lg"
          collapsedWidth={screens.xs ? 0 : 80}
          width="15vw"
          style={{
            minWidth: 180,
            overflow: "auto",
            height: "100vh",
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            background: "#fff",
            boxShadow: "2px 0 8px rgba(0,0,0,0.08)",
            scrollbarWidth: "thin",
            scrollbarColor: "#e0e0e0 #fff",
          }}
          className="custom-sider"
        >
          <div
            style={{
              height: 32,
              margin: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#222",
              fontWeight: 600,
              borderRadius: 4,
            }}
          >
            {screens.xs ? (
              <Button
                type="text"
                icon={<ArrowLeftOutlined style={{ fontSize: 24 }} />}
                onClick={() => setCollapsed(true)}
                style={{
                  width: 40,
                  height: 40,
                  marginRight: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              />
            ) : (
              t("sidebar.title")
            )}
          </div>
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={getMenuItems()}
            onClick={({ key }) => navigate(key)}
            style={{ background: "#fff", border: "none" }}
          />
        </Sider>
      )}
      <Layout
        style={{
          marginLeft: isSidebarVisible
            ? screens.xs
              ? 0
              : collapsed
                ? 80
                : "15vw"
            : 0,
          transition: "all 0.2s",
        }}
      >
        {location.pathname !== "/Login" && location.pathname !== "/swagger" && (
          <div style={{ position: "relative", zIndex: 1 }}>
            {renderHeader()}
          </div>
        )}
        <Content
          style={{
            margin:
              location.pathname === "/interactive-map"
                ? 0
                : screens.xs
                  ? "12px 8px"
                  : "24px 16px",
            padding:
              location.pathname === "/interactive-map"
                ? 0
                : screens.xs
                  ? 16
                  : 24,
            background:
              location.pathname === "/interactive-map"
                ? "transparent"
                : colorBgContainer,
            borderRadius:
              location.pathname === "/interactive-map" ? 0 : borderRadiusLG,
            minHeight:
              location.pathname === "/interactive-map"
                ? "calc(100vh - 64px)"
                : 280,
            height:
              location.pathname === "/interactive-map"
                ? "calc(100vh - 64px)"
                : "auto",
            overflow:
              location.pathname === "/interactive-map" ? "hidden" : "visible",
          }}
        >
          <Routes>
            <Route
              path="/"
              element={
                token ? (
                  role === "admin" || role === "manager" ? (
                    <Navigate to="/admin-stats" replace />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )
                ) : (
                  <Navigate to="/interactive-map" replace />
                )
              }
            />
            <Route path="/Login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route
              path="/admin-stats"
              element={
                <ProtectedRoute roles={["admin", "manager"]}>
                  <AdminStats />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={["expert", "admin", "manager"]}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/areas"
              element={
                <ProtectedRoute roles={["admin", "manager"]}>
                  <AreaList />
                </ProtectedRoute>
              }
            />
            <Route path="/interactive-map" element={<InteractiveMap />} />
            <Route
              path="/user-list"
              element={
                <ProtectedRoute roles={["admin", "manager"]}>
                  {token &&
                    jwtDecode(token).role === "manager" &&
                    jwtDecode(token).district ? (
                    <Navigate to="/" replace />
                  ) : (
                    <UserList />
                  )}
                </ProtectedRoute>
              }
            />
            <Route path="/predictions/:areaId" element={<Prediction />} />
            <Route
              path="/predictions/details/:predictionId"
              element={
                <ProtectedRoute roles={["expert", "admin", "manager"]}>
                  <PredictionDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-prediction"
              element={
                <ProtectedRoute roles={["expert", "admin"]}>
                  <CreatePrediction />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute roles={["admin", "expert", "manager"]}>
                  <UserProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs"
              element={
                <ProtectedRoute roles={["admin", "expert"]}>
                  <Jobs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/email-list"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <EmailList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/email-subscription/:areaId"
              element={<EmailSubscription />}
            />
            <Route path="/unsubscribe/:token" element={<UnsubscribePage />} />
            <Route path="/swagger" element={<SwaggerViewer />} />
            <Route
              path="/ml-models"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <MLModelManagement />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
