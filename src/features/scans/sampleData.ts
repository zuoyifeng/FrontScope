import type { ReportPreview, ScanModule } from './types';

export const initialModules: ScanModule[] = [
  {
    key: 'runtime',
    title: '运行时诊断',
    description: '采集控制台错误、页面异常、失败请求和页面截图。',
    status: 'ready',
  },
  {
    key: 'performance',
    title: '性能审计',
    description: '运行 Lighthouse 和 Performance Trace，提取评分、核心指标、长任务和布局偏移。',
    status: 'ready',
  },
  {
    key: 'network',
    title: 'Network 资源诊断',
    description: '采集资源体积、缓存命中率、慢请求、大资源和失败请求。',
    status: 'ready',
  },
  {
    key: 'package',
    title: '项目扫描',
    description: '读取脚本、依赖、框架特征和构建配置文件。',
    status: 'ready',
  },
];

export const reportPreview: ReportPreview = {
  readiness: 32,
};
