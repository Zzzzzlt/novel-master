# 第四组-AI小说大师

## 1 简介

### 1.1 作品创意/项目背景

随着人工智能技术的快速发展，AI辅助内容创作已成为数字化转型的重要领域。当前市面上涌现了众多AI写作工具，但大多侧重于短篇内容生成或简单的对话交互，对长篇小说创作的复杂场景支持不足。长篇小说创作具有内容连贯性要求高、角色关系复杂、情节脉络长等特点，需要AI能够持续跟踪上下文，同时为作者提供结构化的创作辅助。

本项目"AI小说大师"旨在打造一款专注于长篇小说创作的沉浸式AI写作工具。核心理念是构建一个能够"记住"小说发展脉络的智能助手，通过前端精细的上下文管理，实现对大语言模型API的精准控制。系统采用三栏布局设计，左侧管理多个创作会话，中央提供沉浸式对话流，右侧实时显示角色状态、情节摘要等辅助信息，为作者提供完整的创作工作台。

项目创新性地提出了"平行宇宙"概念，通过树状数据结构支持对话分支与回滚，让作者可以无成本地探索不同的剧情走向。同时集成了动态记忆管理系统，采用Sliding Window滑动窗口机制自动管理对话上下文，既保证了AI响应的连贯性，又有效控制了Token消耗。

### 1.2 项目实施计划

本项目实施过程分为四个主要阶段：

**第一阶段：前期准备与构思（2025年12月）**
- 进行需求调研和可行性分析，明确项目核心定位
- 完成技术选型，确定React + Vite + Zustand + Tailwind技术栈
- 搭建开发环境，初始化项目代码仓库
- 梳理核心功能模块，制定分阶段开发计划

**第二阶段：前端搭建（2025年12月-2026年1月上旬）**
- 使用Vite构建工具快速搭建React + TypeScript开发骨架
- 实现经典三栏布局：左侧会话管理区、中央沉浸式创作区、右侧智能辅助面板
- 封装通用UI组件，确保整体视觉风格统一
- 集成Tailwind CSS，构建支持明暗主题双模式切换的色彩系统
- 初步集成DeepSeek API，实现基础对话功能

**第三阶段：功能优化与完善（2026年1月中旬-2月下旬）**
- 实现分支会话功能，支持树状结构的会话管理
- 开发动态记忆管理系统，实现Sliding Window滑动窗口机制
- 实现三种创作模式切换：基础设定协作模式、正文创作模式、记录分析模式
- 完善Markdown渲染和代码高亮功能
- 添加设置面板，支持API Key配置、记忆轮数调整、主题模式切换
- 实现登录功能，通过Netlify Identity支持用户数据云端同步
- 针对移动端设备进行响应式适配优化

**第四阶段：上线部署（2026年2月下旬-3月初）**
- 部署至Netlify平台，配置自动化构建流程
- 处理环境变量配置，支持多种API Key提供方式
- 配置自定义域名，完成项目正式上线
- 收集用户反馈，准备后续迭代优化

## 2 总体设计

### 2.1 系统功能

#### 2.1.1 功能概述

AI小说大师是一款基于Web的长篇小说创作辅助工具，主要功能包括多会话管理、动态记忆管理、分支创作、智能辅助面板等。系统通过前端精细化控制大语言模型API调用，实现针对长篇创作场景的定制化交互体验。

#### 2.1.2 功能说明

**会话管理**
- 支持创建、重命名、删除多个创作会话
- 采用树状结构展示会话，支持父子关系可视化
- 支持分支会话功能，可在任意对话节点创建新分支
- 支持会话导出为Markdown或纯文本格式

**动态记忆管理**
- 采用Sliding Window滑动窗口机制自动管理对话上下文
- 用户可自定义记忆轮数，灵活控制上下文长度
- 前端智能截取最近N轮对话注入API调用
- 在保证创作连贯性的同时有效控制Token消耗

**创作模式切换**
- 基础设定协作模式（Setting Mode）：独立工作区打磨世界观、角色背景及大纲，支持Markdown渲染与流式输出
- 正文创作模式（Body Mode）：主要工作区，支持DeepSeek等模型的深度思考标签渲染，集成核心记忆管理系统
- 记录分析模式（Record Mode）：隐式运行的后台分析模式，将正文发送给AI分析，返回结构化的情节摘要、角色状态及剧情建议

**智能辅助面板**
- 实时显示当前创作的世界观设定
- 动态更新角色状态列表
- 展示情节摘要和下一章走向建议
- 支持快速查看历史对话内容

**用户体验优化**
- 支持明暗主题双模式切换
- 提供设置面板，可配置API Key、记忆轮数、主题模式等
- 响应式设计，支持桌面端和移动端
- 支持用户登录，通过Netlify Identity实现数据云端同步

### 2.2 系统软硬件平台

#### 2.2.1 系统开发平台（含开源/第三方工具）

**前端框架**
- React 19.2.3：用于构建用户界面的JavaScript库
- TypeScript 5.8.2：提供类型安全的JavaScript超集

**状态管理**
- Zustand 5.0.9：轻量级状态管理库，适合中小型项目

**构建工具**
- Vite 6.2.0：下一代前端构建工具，提供快速的冷启动和热更新
- @vitejs/plugin-react 5.0.0：Vite的React插件

**样式框架**
- Tailwind CSS：Utility-First CSS框架，提供快速样式开发能力
- 通过CDN引入，无需本地构建

**第三方库**
- lucide-react 0.562.0：开源图标库，提供线条简洁、风格统一的图标
- react-markdown 10.1.0：Markdown渲染库，支持丰富的Markdown语法
- rehype-highlight 7.0.2：代码高亮插件，支持多种编程语言
- rehype-raw 7.0.0：允许在Markdown中嵌入HTML标签
- react-virtuoso 4.12.3：高性能虚拟滚动列表，优化长列表渲染性能
- netlify-identity-widget 1.9.2：Netlify身份验证组件

**部署平台**
- Netlify：静态网站托管服务，支持自动化部署和持续集成
- Git：版本控制系统，用于代码管理

**开发环境**
- Node.js：JavaScript运行环境
- npm：包管理工具

#### 2.2.2 系统运行平台

**客户端**
- 操作系统：Windows、macOS、Linux
- 浏览器：Chrome（推荐）、Edge、Firefox、Safari等现代浏览器
- 网络环境：需要稳定的互联网连接，用于调用DeepSeek API和Netlify Identity服务

**服务端**
- Netlify平台：提供静态网站托管、自动化构建、HTTPS证书等服务
- DeepSeek API：提供大语言模型接口，支持对话生成
- Netlify Identity：提供用户认证和数据同步服务

### 2.3 关键技术

**前端技术栈**
- React组件化开发模式，实现高度复用的UI组件
- TypeScript类型系统，提升代码质量和开发效率
- Vite构建优化，实现快速开发和部署
- Zustand状态管理，简化全局状态管理逻辑

**样式与布局**
- Tailwind CSS Utility-First模式，快速构建响应式界面
- HSL色彩空间，构建支持明暗双模式的色彩系统
- Flexbox布局，实现灵活的三栏界面设计

**数据处理**
- react-virtuoso虚拟滚动，优化长列表渲染性能
- Sliding Window算法，动态管理对话上下文
- 树状数据结构，支持分支会话管理

**外部集成**
- DeepSeek API集成，实现AI对话生成
- Markdown渲染，支持富文本展示
- 代码高亮，提升阅读体验

### 2.4 作品特色

**1. 专注长篇小说创作的场景优化**
不同于市面上侧重短篇生成的AI写作工具，本项目专为长篇连载创作设计。通过动态记忆管理系统，确保AI在写作第100章时仍能记住第1章的关键伏笔，解决长篇创作中上下文连贯性的核心难题。

**2. 平行宇宙创作模式**
创新性地支持分支会话功能，用户可在任意对话节点创建新分支，探索不同的剧情走向。各分支之间相互独立、互不干扰，大大降低了创作试错成本。

**3. 三栏沉浸式布局**
借鉴专业IDE的界面交互设计，左侧管理会话，中央沉浸式创作，右侧实时辅助。这种布局让作者能够在创作过程中随时查看设定、回顾情节，无需频繁切换页面。

**4. 前端智能上下文管理**
通过前端实现的Sliding Window机制，自动管理对话上下文长度。用户可自定义记忆轮数，灵活权衡上下文连续性与API调用成本，实现精细化的Token使用控制。

**5. 本地化数据隐私**
用户数据存储在浏览器本地，API Key也支持运行时手动输入，确保创作隐私得到保护。同时提供Netlify Identity登录选项，支持跨设备数据同步。

**6. 完整的Markdown支持**
集成react-markdown和rehype-highlight，支持标题、列表、引用、代码块等完整Markdown语法，满足作者对格式多样化的需求。

## 3 详细设计说明

### 3.1 系统结构设计

#### 3.1.1 技术架构

系统采用前后端分离的架构设计，前端为React单页应用（SPA），后端服务完全依赖第三方API。

**前端架构**
- 应用层：React组件，负责用户界面渲染和交互
- 状态层：Zustand Store，管理全局状态
- 服务层：API调用服务，负责与DeepSeek API和Netlify Identity通信
- 工具层：通用工具函数，如格式化、验证等

**组件层级**
- App：根组件
  - Sidebar：左侧边栏
    - SessionList：会话列表
    - SessionItem：单个会话项
  - ChatArea：中央聊天区域
    - MessageList：消息列表
    - MessageItem：单个消息项
    - InputBar：输入框
  - RightPanel：右侧面板
    - Settings：设置面板
    - CharacterPanel：角色面板
    - PlotPanel：情节面板

#### 3.1.2 功能模块设计

**会话管理模块**
- 负责会话的增删改查操作
- 维护会话的树状结构关系
- 支持分支创建和合并

**对话管理模块**
- 管理单个会话内的消息列表
- 实现消息的发送、接收和展示
- 支持消息的编辑和删除

**记忆管理模块**
- 实现Sliding Window滑动窗口算法
- 根据用户设置动态生成上下文
- 过滤和格式化历史消息

**API集成模块**
- 封装DeepSeek API调用
- 处理API响应和错误
- 支持流式响应

**用户认证模块**
- 集成Netlify Identity
- 管理用户登录状态
- 实现数据云端同步

#### 3.1.3 关键功能/算法设计

**Sliding Window滑动窗口算法**

```
输入：完整消息列表、记忆轮数N
输出：用于API调用的上下文消息列表

算法流程：
1. 获取完整消息列表长度L
2. 如果L <= N，返回全部消息
3. 如果L > N，返回最后N条消息
4. 每条消息包含角色和内容
5. 过滤掉系统提示消息，只保留用户和AI对话
6. 按时间顺序排序
```

**分支创建算法**

```
输入：当前会话ID、当前消息索引
输出：新分支会话ID

算法流程：
1. 复制当前会话的所有数据
2. 截取到指定索引位置的消息
3. 创建新会话记录
4. 建立父子关系：新会话.parent = 当前会话ID
5. 更新会话树状结构
6. 返回新会话ID
```

### 3.2 数据结构设计

#### 3.2.1 存储数据

##### 1. 数据库

本项目采用前端存储方案，主要数据存储在浏览器Local Storage和IndexedDB中。

**Local Storage存储**
```
{
  "sessions": [
    {
      "id": "string",           // 会话唯一标识
      "title": "string",        // 会话标题
      "parentId": "string",     // 父会话ID
      "children": ["string"],   // 子会话ID列表
      "createdAt": "number",    // 创建时间戳
      "updatedAt": "number",    // 更新时间戳
      "mode": "string",        // 当前创作模式
      "settings": {            // 会话设置
        "memoryRounds": number  // 记忆轮数
      }
    }
  ],
  "messages": {
    "sessionId": [
      {
        "id": "string",           // 消息唯一标识
        "role": "user|assistant", // 消息角色
        "content": "string",      // 消息内容
        "timestamp": "number",     // 时间戳
        "metadata": {             // 消息元数据
          "chapter": "string",   // 章节信息
          "characters": ["string"] // 涉及角色
        }
      }
    ]
  },
  "settings": {
    "apiKey": "string",         // API Key
    "apiBaseUrl": "string",     // API基础URL
    "memoryRounds": number,      // 默认记忆轮数
    "theme": "light|dark",     // 主题模式
    "userId": "string"          // 用户ID
  }
}
```

**IndexedDB存储**
```
{
  "name": "NovelMasterDB",
  "stores": [
    {
      "name": "sessions",
      "keyPath": "id",
      "indexes": ["parentId", "createdAt"]
    },
    {
      "name": "messages",
      "keyPath": "id",
      "indexes": ["sessionId", "timestamp"]
    },
    {
      "name": "exports",
      "keyPath": "id",
      "indexes": ["sessionId", "exportedAt"]
    }
  ]
}
```

##### 2. 文件存储

**导出文件存储**
- 支持导出为Markdown格式（.md）
- 支持导出为纯文本格式（.txt）
- 文件通过浏览器下载API保存到本地

**图片/附件存储**
- 当前版本不支持图片上传
- Markdown中的图片通过外部URL引用
- 未来版本可考虑集成图片存储服务

#### 3.2.2 接口（模块接口、系统间接口）

**DeepSeek API接口**

```
POST /v1/chat/completions
Headers:
  Authorization: Bearer {apiKey}
  Content-Type: application/json

Body:
{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "{系统提示词}"
    },
    {
      "role": "user",
      "content": "{用户输入}"
    },
    ...
  ],
  "stream": true
}

Response (Stream):
  data: {"id": "...", "choices": [...], "delta": {"content": "..."}}
```

**Netlify Identity接口**

```
GET /.netlify/identity
  获取当前登录用户信息

POST /.netlify/identity/token
  用户登录

POST /.netlify/identity/logout
  用户登出

POST /.netlify/identity/signup
  用户注册
```

**内部模块接口**

```typescript
// 会话管理接口
interface SessionService {
  createSession(title: string): Promise<Session>
  updateSession(id: string, data: Partial<Session>): Promise<void>
  deleteSession(id: string): Promise<void>
  createBranch(parentId: string, messageId: string): Promise<Session>
  getSessions(): Promise<Session[]>
  getSession(id: string): Promise<Session>
}

// 消息管理接口
interface MessageService {
  addMessage(sessionId: string, message: Message): Promise<void>
  updateMessage(id: string, data: Partial<Message>): Promise<void>
  deleteMessage(id: string): Promise<void>
  getMessages(sessionId: string): Promise<Message[]>
  getContext(sessionId: string, rounds: number): Promise<Message[]>
}

// 设置管理接口
interface SettingsService {
  getSettings(): Promise<Settings>
  updateSettings(settings: Partial<Settings>): Promise<void>
}
```

#### 3.2.3 关键数据结构

```typescript
// 会话数据结构
interface Session {
  id: string;
  title: string;
  parentId?: string;
  children: string[];
  createdAt: number;
  updatedAt: number;
  mode: 'setting' | 'body' | 'record';
  settings: {
    memoryRounds: number;
  };
}

// 消息数据结构
interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    chapter?: string;
    characters?: string[];
  };
}

// 设置数据结构
interface Settings {
  apiKey: string;
  apiBaseUrl: string;
  memoryRounds: number;
  theme: 'light' | 'dark';
  userId?: string;
}

// API响应数据结构
interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
  }>;
}
```

### 3.3 系统界面设计

#### 3.3.1 界面设计风格

整体设计遵循简洁、专注、沉浸的设计理念，采用深灰色调（Zinc色系）降低长时间写作的视觉疲劳。

**色彩系统**
- 浅色模式：白色背景（#ffffff）+ 深灰文字（#09090b）
- 深色模式：深灰背景（#09090b）+ 浅灰文字（#fafafa）
- 主题色：低饱和度蓝灰色调，专业而不喧宾夺主
- 强调色：用于按钮、链接等交互元素

**排版**
- 字体：系统默认无衬线字体栈（ui-sans-serif）
- 字号：16px基准字号，确保长时间阅读的舒适性
- 行高：1.6倍行高，提升可读性

**交互**
- 圆角：8px统一圆角，营造柔和友好的视觉感受
- 间距：使用8px基础间距单位，保持节奏感
- 动画：300ms ease-out过渡，提升交互流畅度

#### 3.3.2 主要功能页面

**首页**
- 显示最近使用的会话
- 快速创建新会话按钮
- 用户登录状态显示

**创作页面**
- 左侧边栏：会话列表
  - 新建会话按钮
  - 会话树状列表
  - 当前会话操作（重命名、删除、导出）
- 中央区域：对话流
  - 消息列表（虚拟滚动优化）
  - 底部输入框
  - 发送按钮和附件按钮
- 右侧面板：辅助信息
  - 切换标签（设置/角色/情节）
  - 设置面板内容
  - 角色状态列表
  - 情节摘要卡片

**设置页面**
- API Key配置
- 记忆轮数调整
- 主题模式切换
- 用户登录/登出
- 数据导出

#### 3.3.3 Web网站页面结构设计

**页面层级结构**

```
根路径 /
├── 首页 / (默认创作页面)
│   ├── 左侧边栏
│   │   ├── 会话列表
│   │   └── 会话操作按钮
│   ├── 中央区域
│   │   ├── 消息列表
│   │   └── 输入框
│   └── 右侧面板
│       ├── 设置
│       ├── 角色
│       └── 情节
└── 设置 /settings (独立路由，当前版本集成在右侧面板)
```

**响应式断点**

```
- 桌面端：≥1024px
  - 完整三栏布局

- 平板端：768px - 1023px
  - 左侧边栏可折叠
  - 右侧面板可折叠

- 移动端：<768px
  - 单栏布局
  - 通过抽屉组件切换边栏
```

**路由设计**

```typescript
// 未来版本可扩展的路由结构
const routes = [
  {
    path: '/',
    component: App,
    children: [
      { path: '/', component: Workspace },
      { path: '/settings', component: Settings },
      { path: '/export', component: Export },
    ]
  }
];
```

## 4 系统安装及使用说明

### 4.1 系统安装

本项目为Web应用，无需安装，通过浏览器访问即可使用。

**访问方式**
1. 打开现代浏览器（推荐Chrome）
2. 访问项目部署地址：https://novel-master.netlify.app
3. 首次访问会自动加载应用

**本地开发**
如需本地运行开发版本，执行以下步骤：

```bash
# 1. 克隆代码仓库
git clone https://github.com/your-repo/novel-master.git
cd novel-master

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 访问本地地址
# 打开浏览器访问 http://localhost:5173
```

### 4.2 使用说明

**首次使用**

1. 配置API Key
   - 点击右上角设置按钮
   - 在"API密钥"输入框中填入DeepSeek API Key
   - 点击"保存"按钮

2. 创建新会话
   - 点击左侧边栏的"新建会话"按钮
   - 输入会话标题
   - 按回车或点击确认

3. 开始创作
   - 在中央输入框中输入内容
   - 点击发送按钮或按Enter键
   - 等待AI响应

**高级功能**

**切换创作模式**
- 点击右侧面板的"模式"标签
- 选择"设定"、"正文"或"记录"模式
- 系统会自动调整AI提示词

**创建分支会话**
- 鼠标悬停在任意消息上
- 点击"创建分支"按钮
- 新分支将从此处开始独立发展

**导出内容**
- 点击会话标题旁的"导出"按钮
- 选择Markdown或纯文本格式
- 文件将自动下载到本地

**调整记忆轮数**
- 在设置中找到"记忆轮数"选项
- 调整数值（默认为10轮）
- 较大的数值提供更多上下文，但消耗更多Token

**主题切换**
- 点击设置中的"主题"选项
- 选择"浅色"或"深色"模式
- 设置会自动保存

**数据同步**
- 点击"登录"按钮
- 通过Netlify Identity注册或登录
- 开启数据云端同步功能

## 5 总结

AI小说大师是一款专注于长篇小说创作的AI辅助写作工具，通过创新的前端技术实现了对大语言模型API的精细化控制。项目从2025年12月启动构思，到2026年3月正式上线，历时约三个月，完整经历了需求分析、技术选型、架构设计、功能实现和部署运维等软件工程全生命周期。

**项目成果**

本系统成功实现了以下核心目标：
1. 通过Sliding Window滑动窗口机制，解决了长篇创作中上下文超限的技术难题
2. 创新性地提出"平行宇宙"概念，支持分支会话创作，降低了创作试错成本
3. 采用三栏沉浸式布局设计，为作者提供了完整的创作工作台
4. 实现了三种创作模式的动态切换，满足不同创作场景的需求
5. 构建了基于Local Storage和IndexedDB的前端存储方案，兼顾性能与隐私

**技术收获**

通过本次项目开发，我深入掌握了以下技术：
- React组件化开发和状态管理模式
- TypeScript类型系统的实际应用
- Tailwind CSS Utility-First设计理念
- 前端性能优化技术（虚拟滚动、懒加载等）
- 第三方API集成（DeepSeek API、Netlify Identity）
- 静态网站部署和持续集成（Netlify、Git）

此外，项目开发过程中我掌握了AI辅助编程的能力。通过合理运用AI工具进行代码生成、问题排查与方案优化，显著提升了开发效率。这种人机协作的开发模式，让我深刻认识到未来程序员的核心价值将更多体现在需求分析、架构设计与AI工具的有效整合上。

**不足与展望**

当前版本仍存在以下不足：
1. 移动端体验有待进一步优化，特别是小屏幕设备上的交互细节
2. AI响应的稳定性与质量受限于API服务本身
3. 仅支持DeepSeek单一模型，缺乏多模型切换能力
4. 用户数据完全依赖本地存储，跨设备同步功能尚未完善

未来规划：
- 扩展支持更多大语言模型（如GPT、Claude等）
- 实现更完善的协作功能，支持多人共同创作
- 增加本地缓存机制，提升离线可用性
- 优化移动端交互，提供更流畅的移动端体验
- 接入后端服务，提供更强大的数据管理和分析能力

## 6 附录

### 6.1 名词定义

- **API**：Application Programming Interface，应用程序编程接口，用于软件组件之间通信的规范。
- **Sliding Window**：滑动窗口算法，一种用于管理数据序列的技术，在本项目中用于动态管理对话上下文。
- **SPA**：Single Page Application，单页应用，一种Web应用程序或网站模型，它通过动态重写当前页面与用户交互，而非传统的从服务器重新加载整个新页面。
- **Token**：大语言模型使用的计量单位，用于衡量输入和输出的文本长度。
- **Markdown**：一种轻量级标记语言，允许人们使用易读易写的纯文本格式编写文档。
- **Zustand**：一个轻量级的状态管理库，用于管理React应用的全局状态。
- **Vite**：下一代前端构建工具，提供快速的冷启动和热更新。
- **Netlify**：一个云平台，提供静态网站托管、自动化构建、HTTPS证书等服务。

### 6.2 参考资料

1. React官方文档：https://react.dev/
2. Tailwind CSS文档：https://tailwindcss.com/
3. Zustand文档：https://zustand-demo.pmnd.rs/
4. DeepSeek API文档：https://platform.deepseek.com/docs/
5. Netlify文档：https://docs.netlify.com/
6. TypeScript官方文档：https://www.typescriptlang.org/docs/

### 6.3 源代码清单

项目主要源文件结构：

```
novel-master/
├── src/
│   ├── App.tsx              # 应用根组件
│   ├── main.tsx             # 应用入口
│   ├── index.css            # 全局样式
│   ├── components/          # 组件目录
│   │   ├── Sidebar.tsx     # 左侧边栏
│   │   ├── ChatArea.tsx     # 中央聊天区域
│   │   ├── RightPanel.tsx   # 右侧面板
│   │   ├── MessageItem.tsx  # 消息项组件
│   │   ├── InputBar.tsx     # 输入框组件
│   │   ├── Settings.tsx     # 设置面板
│   │   └── ...
│   ├── store/              # 状态管理
│   │   └── useStore.ts    # Zustand Store
│   ├── services/           # 服务层
│   │   ├── aiService.ts   # AI服务
│   │   ├── aiConfig.ts    # AI配置
│   │   └── auth.ts       # 认证服务
│   ├── types.ts            # 类型定义
│   └── utils.ts           # 工具函数
├── index.html             # HTML模板
├── package.json           # 项目依赖
├── vite.config.ts        # Vite配置
└── tsconfig.json         # TypeScript配置
```

**核心文件说明**

- **App.tsx**：应用主组件，负责整体布局和路由
- **store/useStore.ts**：全局状态管理，包含会话、消息、设置等状态
- **services/aiService.ts**：封装DeepSeek API调用，支持流式响应
- **services/aiConfig.ts**：AI配置管理，从环境变量或用户设置中读取API Key
- **components/ChatArea.tsx**：中央聊天区域，包含消息列表和输入框
- **components/Sidebar.tsx**：左侧会话管理边栏
- **components/RightPanel.tsx**：右侧辅助面板，包含设置、角色、情节等信息
