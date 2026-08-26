import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Frame,
  ImageIcon,
  Layers3,
  Menu,
  MessageSquareText,
  ScanSearch,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import styles from './home.module.css';

const workflowSteps = [
  {
    icon: MessageSquareText,
    title: '描述创作意图',
    description: '从一句描述、一张参考图或现有素材开始，让 Agent 帮你梳理画面方向。',
  },
  {
    icon: WandSparkles,
    title: '生成并持续迭代',
    description: '集中设置模型、画幅和参考素材，在同一条创作线上比较每次结果。',
  },
  {
    icon: Frame,
    title: '整理成为作品',
    description: '把灵感、参考图和生成结果放进无限画布，继续编辑、导出或复用。',
  },
];

const capabilities = [
  {
    icon: ImageIcon,
    title: '文生图与图生图',
    description: '支持从文本生成、参考图改造与多轮变化，保留每一次探索的上下文。',
    tag: '生成',
  },
  {
    icon: Bot,
    title: '创作 Agent',
    description: '通过对话拆解需求，结合视觉理解、搜索与模型工具推进复杂任务。',
    tag: '协作',
  },
  {
    icon: Layers3,
    title: '无限画布',
    description: '并排整理参考素材、候选图和最终结果，让视觉思路保持连续。',
    tag: '编排',
  },
  {
    icon: ScanSearch,
    title: '反向提示词',
    description: '从已有图像提取可继续使用的描述，为复刻风格和二次创作提供起点。',
    tag: '理解',
  },
  {
    icon: Sparkles,
    title: '提示词管理',
    description: '保存、整理和复用有效提示词，减少重复试错，让团队表达更一致。',
    tag: '沉淀',
  },
  {
    icon: Frame,
    title: '视觉延展工具',
    description: '继续完成 GIF、界面切图与网页还原等任务，把图像接入后续工作流。',
    tag: '延展',
  },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="Twinkle Image 首页">
            <img src="/brand-mark.svg" alt="" />
            <span>Twinkle Image</span>
          </Link>

          <nav className={styles.desktopNav} aria-label="首页导航">
            <a href="#workflow">创作流程</a>
            <a href="#capabilities">核心能力</a>
            <a href="#open-source">开源说明</a>
          </nav>

          <div className={styles.headerActions}>
            <ThemeToggle />
            <details className={styles.mobileMenu}>
              <summary aria-label="打开导航菜单">
                <Menu size={17} />
                <span>菜单</span>
                <ChevronDown className={styles.menuChevron} size={14} />
              </summary>
              <nav aria-label="移动端首页导航">
                <a href="#workflow">创作流程</a>
                <a href="#capabilities">核心能力</a>
                <a href="#open-source">开源说明</a>
              </nav>
            </details>
            <Link className={`${styles.inkButton} ${styles.headerCta}`} href="/studio">
              <span className={styles.headerCtaFull}>进入创作工作台</span>
              <span className={styles.headerCtaShort}>进入工作台</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span />开源 AI 图像创作工作台</p>
            <h1>从一句想法，到一组<span>可继续创作</span>的图像。</h1>
            <p className={styles.lede}>
              Twinkle Image 把图像生成、参考图编辑、创作 Agent 与无限画布放在一个安静而完整的工作空间里。
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/studio">
                开始创作 <ArrowRight size={17} />
              </Link>
              <a className={styles.secondaryButton} href="#workflow">了解创作流程</a>
            </div>
            <dl className={styles.heroFacts} aria-label="产品能力概览">
              <div><dt>多种起点</dt><dd>文字、参考图、空白画布</dd></div>
              <div><dt>多模型接入</dt><dd>按任务选择生成能力</dd></div>
              <div><dt>本地工作流</dt><dd>任务、素材与历史可管理</dd></div>
            </dl>
          </div>

          <div className={styles.preview} aria-label="Twinkle Image 创作工作台预览">
            <div className={styles.previewTop}>
              <span>TWINKLE IMAGE / 创作工作台</span>
              <span className={styles.previewStatus}><i />工作区已就绪</span>
            </div>
            <div className={styles.previewBody}>
              <div className={styles.previewRail} aria-hidden="true">
                <div className={styles.previewMark}><Sparkles size={17} /></div>
                <span className={styles.railActive}><Bot size={16} /></span>
                <span><ImageIcon size={16} /></span>
                <span><Frame size={16} /></span>
              </div>
              <div className={styles.previewWorkspace}>
                <div className={styles.previewCanvas}>
                  <div className={styles.canvasMeta}><span>暮色中的海边建筑</span><span>16:9</span></div>
                  <div className={styles.canvasArtwork}>
                    <div className={styles.artworkSun} />
                    <div className={styles.artworkHorizon} />
                    <div className={styles.artworkShape} />
                    <span className={styles.resultBadge}><Check size={12} />生成完成</span>
                  </div>
                  <div className={styles.promptBar}><span>保留暖色光线，增加建筑层次与海面细节</span><b><ArrowRight size={15} /></b></div>
                </div>
                <aside className={styles.previewInspector} aria-label="本次创作设置">
                  <div><span>本次创作</span><small>已自动保存</small></div>
                  <dl>
                    <div><dt>模式</dt><dd>参考图生成</dd></div>
                    <div><dt>参考素材</dt><dd>2 张</dd></div>
                    <div><dt>输出数量</dt><dd>4 张</dd></div>
                    <div><dt>画面比例</dt><dd>16:9</dd></div>
                  </dl>
                  <p><Sparkles size={14} />在同一工作流里继续调整，不必从头开始。</p>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className={styles.section}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionIndex}>01 / 创作流程</p>
            <h2>让灵感沿着同一条线，逐步成为画面。</h2>
            <p>从需求理解到生成、筛选和整理，所有关键步骤彼此相连，减少在工具之间来回切换。</p>
          </div>
          <div className={styles.steps}>
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title}>
                  <span>0{index + 1}</span>
                  <Icon size={20} />
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="capabilities" className={`${styles.section} ${styles.capabilitySection}`}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionIndex}>02 / 核心能力</p>
            <h2>覆盖完整图像过程，而不只是一次生成。</h2>
            <p>保留真实创作中最常用的能力，并让复杂选项在需要时才出现。</p>
          </div>
          <div className={styles.capabilityGrid}>
            {capabilities.map((capability, index) => {
              const Icon = capability.icon;
              return (
                <article key={capability.title}>
                  <div className={styles.capabilityMeta}><span>0{index + 1}</span><small>{capability.tag}</small></div>
                  <Icon size={20} />
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="open-source" className={styles.cta}>
          <div>
            <p className={styles.sectionIndex}>03 / 开始创作</p>
            <h2>把下一张图，放进一个能继续生长的工作空间。</h2>
            <p>Twinkle Image 是 Nova Image Studio 的社区衍生项目，源代码按 AGPL-3.0 许可提供。</p>
          </div>
          <Link className={styles.inkButton} href="/studio">打开 Twinkle Image <ArrowRight size={16} /></Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Twinkle Image</span>
        <span>为持续发生的视觉创作而设计。</span>
      </footer>
    </div>
  );
}
