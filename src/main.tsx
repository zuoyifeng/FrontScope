import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#006eff',
          colorInfo: '#1e293b',
          borderRadius: 10,
          fontFamily: "'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Button: {
            primaryShadow: '0 4px 14px rgba(0, 110, 255, 0.28)',
          },
          Segmented: {
            itemSelectedBg: '#e6f0ff',
            itemSelectedColor: '#0052d9',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
