#!/usr/bin/env node
import { Command } from 'commander';
import { runScan } from './scan/runScan.js';
import { createMockAiProvider } from './ai/aiProvider.js';

const program = new Command();

program
  .name('frontscope')
  .description('本地优先的前端项目 AI 体检工具')
  .option('-p, --project [path]', '前端项目路径（可选，用于扫描项目依赖）')
  .requiredOption('-u, --url <url>', '页面地址，例如 http://localhost:5173 或 https://example.com')
  .option('-v, --viewport <mode>', 'desktop 或 mobile', 'desktop')
  .option('-n, --name <name>', '页面名称')
  .option('-o, --output <dir>', '报告输出目录')
  .option('--auth-state <path>', 'Playwright storageState 登录态文件，用于扫描需要登录/权限的页面')
  .option('--ai', '生成 AI 诊断（使用 frontscope.config.json 或环境变量中配置的 provider）')
  .option('--config <path>', 'AI 配置文件路径，默认读取当前目录的 frontscope.config.json')
  .option('--mock-ai', '使用本地 mock AI provider 生成诊断，用于验证链路')
  .option('--memory', '采集堆快照做内存诊断（较慢）')
  .option('--memory-reload-rounds <n>', '内存对比：重复加载次数（>0 时启用前后快照对比）', '0')
  .action(async (options) => {
    try {
      const { scanDir, scanJsonPath, reportMarkdownPath, result } = await runScan(
        {
          projectPath: options.project,
          url: options.url,
          viewport: options.viewport,
          pageName: options.name,
          outputDir: options.output,
          authStatePath: options.authState,
          enableAi: Boolean(options.ai || options.mockAi),
          enableMemory: Boolean(options.memory),
          memoryReloadRounds: Number.parseInt(options.memoryReloadRounds, 10) || 0,
        },
        {
          configPath: options.config,
          ...(options.mockAi ? { aiProvider: createMockAiProvider() } : {}),
        },
      );

      console.log(`FrontScope 扫描完成: ${result.id}`);
      console.log(`报告目录: ${scanDir}`);
      console.log(`报告文件: ${scanJsonPath}`);
      console.log(`Markdown 报告: ${reportMarkdownPath}`);
      console.log(`模块异常: ${result.errors.length}`);
      console.log(`AI 诊断: ${result.aiDiagnosis ? result.aiDiagnosis.healthLevel : '未生成'}`);
      if (result.aiRunMeta) {
        const meta = result.aiRunMeta;
        console.log(
          `AI 调用: status=${meta.status ?? 'n/a'} provider=${meta.provider ?? 'n/a'} model=${meta.model ?? 'n/a'} duration=${meta.durationMs ?? 0}ms`,
        );
        if (meta.error) {
          console.error(`AI 错误: ${meta.error}`);
        }
      }
      console.log(`页面标题: ${result.runtime?.title ?? '未获取'}`);
      console.log(
        `运行时错误: ${(result.runtime?.consoleErrors.length ?? 0) + (result.runtime?.pageErrors.length ?? 0)}`,
      );
      console.log(
        `失败请求: ${(result.runtime?.requestFailures.length ?? 0) + (result.runtime?.httpErrors.length ?? 0)}`,
      );
      console.log(`性能分数: ${result.lighthouse?.scores.performance ?? 'n/a'}`);
      console.log(`可访问性分数: ${result.lighthouse?.scores.accessibility ?? 'n/a'}`);
      console.log(`最佳实践分数: ${result.lighthouse?.scores.bestPractices ?? 'n/a'}`);
      console.log(`SEO 分数: ${result.lighthouse?.scores.seo ?? 'n/a'}`);
      console.log(`Trace 文件: ${result.performanceTrace?.tracePath ?? '未采集'}`);
      console.log(`Long Task 数: ${result.performanceTrace?.longTasks.length ?? 'n/a'}`);
      console.log(`Layout Shift 数: ${result.performanceTrace?.layoutShifts.length ?? 'n/a'}`);
      if (result.memory) {
        console.log(
          `内存诊断: detached 节点 ${result.memory.baseline?.stats.detachedNodeCount ?? 'n/a'}，疑似泄漏 ${
            result.memory.comparison?.suspectedLeak ? '是' : '否'
          }`,
        );
      } else {
        console.log('内存诊断: 未启用（使用 --memory 开启）');
      }
      if (result.projectQuality) {
        const pq = result.projectQuality;
        console.log(
          `项目质量: 类型检查 ${pq.typecheck.status}，ESLint ${pq.eslint.status}，代码审查发现 ${pq.codeReview.findings.length} 项`,
        );
      }

      if (result.package) {
        console.log(`包管理器: ${result.package.packageManager}`);
        console.log(`框架特征: ${result.package.frameworkHints.join(', ') || '未识别'}`);
      } else {
        console.log('项目依赖: 未提供项目路径，跳过扫描');
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program.parse();
