// LoadingScreen.jsx
import React from "react";
import { Spin, Typography, Space } from "antd";

const { Title, Text } = Typography;

const LoadingScreen = () => {
  return (
    <div style={styles.container}>
      <Space direction="vertical" align="center" size={40}>
        <Space align="center" size={20}>
          <img
            src="/quanlytainguyen/favicon.svg"
            alt="Logo"
            style={{ width: 64, height: 64 }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Text
              type="secondary"
              style={{ letterSpacing: "2px", fontSize: "14px" }}
            >
              AQUACULTURE
            </Text>
            <Title level={3} style={{ margin: 0, textTransform: "uppercase" }}>
              PREDICTION SYSTEM
            </Title>
          </div>
        </Space>

        <Spin size="large" />
      </Space>
    </div>
  );
};

// Style inline để không cần tạo file CSS
const styles = {
  container: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff", // Nền trắng
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 9999,
  },
};

export default LoadingScreen;
