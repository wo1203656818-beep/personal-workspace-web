const CHAT_TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '创建新任务。可以指定标题、备注、截止日期、是否重要、是否加入我的一天、所属列表名称。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          note: { type: 'string', description: '任务备注' },
          dueDate: { type: 'string', description: '截止日期，格式 yyyy-MM-dd' },
          isImportant: { type: 'boolean', description: '是否标记为重要' },
          isMyDay: { type: 'boolean', description: '是否加入我的一天' },
          listName: { type: 'string', description: '所属列表名称，不指定则用默认列表' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_tasks',
      description: '搜索任务。根据关键词匹配未完成任务，可选包含已完成任务。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          includeCompleted: { type: 'boolean', description: '是否包含已完成任务，默认只搜未完成' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: '标记任务为已完成。可通过 id 或关键词定位任务。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 ID' },
          keyword: { type: 'string', description: '任务标题关键词，用于模糊匹配' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '更新任务信息。可通过 id 或关键词定位任务，然后修改标题、备注、截止日期、提醒、重要性、我的一天等字段。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 ID' },
          keyword: { type: 'string', description: '任务标题关键词，用于模糊匹配' },
          title: { type: 'string', description: '新标题' },
          note: { type: 'string', description: '新备注' },
          dueDate: { type: 'string', description: '新截止日期，格式 yyyy-MM-dd' },
          reminder: { type: 'string', description: '新提醒时间' },
          isImportant: { type: 'boolean', description: '是否标记为重要' },
          isMyDay: { type: 'boolean', description: '是否加入我的一天' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '删除任务。可通过 id 或关键词定位任务。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 ID' },
          keyword: { type: 'string', description: '任务标题关键词，用于模糊匹配' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overview',
      description: '获取系统概览，包括未完成任务数、今日已完成数、逾期数、我的一天任务数、即将到期任务、各列表任务分布等。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_note',
      description: '创建新笔记。可以指定标题和内容。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' },
          content: { type: 'string', description: '笔记内容' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '搜索笔记。根据关键词匹配笔记标题和内容。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: '更新笔记。可通过 noteId 或关键词定位笔记，然后修改标题和内容。',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: '笔记 ID' },
          keyword: { type: 'string', description: '笔记标题关键词，用于模糊匹配' },
          title: { type: 'string', description: '新标题' },
          content: { type: 'string', description: '新内容' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: '删除笔记。可通过 noteId 或关键词定位笔记。',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: '笔记 ID' },
          keyword: { type: 'string', description: '笔记标题关键词，用于模糊匹配' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'coin_flip',
      description: '抛硬币决策。随机返回正面或反面，可附带一个问题。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '与抛硬币相关的问题' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_theme',
      description: '切换界面主题。',
      parameters: {
        type: 'object',
        properties: {
          value: { type: 'string', enum: ['light', 'dark', 'system'], description: '主题值：light（浅色）、dark（深色）、system（跟随系统）' },
        },
        required: ['value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: '导航到指定页面路径。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标路径，如 /notes、/tasks 等' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ai_config',
      description: '查看当前生效的 AI 配置信息，包括类型、接口、模型、Key 是否已设置等。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_ai_config',
      description: '创建或更新 AI 配置。可指定名称、类型（openai/cloudflare）、接口地址、API Key、模型名称，并设为默认配置。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '配置名称' },
          type: { type: 'string', enum: ['openai', 'cloudflare'], description: '配置类型' },
          baseUrl: { type: 'string', description: 'API 接口地址（openai 类型必填）' },
          apiKey: { type: 'string', description: 'API Key' },
          model: { type: 'string', description: '模型名称' },
          setDefault: { type: 'boolean', description: '是否设为默认配置，默认 true' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task_list',
      description: '创建新的任务列表。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '列表名称' },
          color: { type: 'string', description: '列表颜色，十六进制色值，如 #2563EB' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_list',
      description: '更新任务列表名称或颜色。可通过 listId 或关键词定位列表。',
      parameters: {
        type: 'object',
        properties: {
          listId: { type: 'string', description: '列表 ID' },
          keyword: { type: 'string', description: '列表名称关键词，用于模糊匹配' },
          name: { type: 'string', description: '新名称' },
          color: { type: 'string', description: '新颜色，十六进制色值' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task_list',
      description: '删除任务列表及其下所有任务。可通过 listId 或关键词定位列表。',
      parameters: {
        type: 'object',
        properties: {
          listId: { type: 'string', description: '列表 ID' },
          keyword: { type: 'string', description: '列表名称关键词，用于模糊匹配' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_subtask',
      description: '为指定任务添加子任务。可通过 taskId 或 taskKeyword 定位父任务。',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '父任务 ID' },
          taskKeyword: { type: 'string', description: '父任务标题关键词，用于模糊匹配' },
          title: { type: 'string', description: '子任务标题' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_subtask',
      description: '勾选或取消勾选子任务。可通过 subtaskId 或 taskKeyword+title 定位子任务。',
      parameters: {
        type: 'object',
        properties: {
          subtaskId: { type: 'string', description: '子任务 ID' },
          taskKeyword: { type: 'string', description: '父任务标题关键词' },
          title: { type: 'string', description: '子任务标题关键词' },
          complete: { type: 'boolean', description: '指定勾选状态，不传则切换当前状态' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_subtask',
      description: '删除子任务。可通过 subtaskId 或 taskKeyword+title 定位子任务。',
      parameters: {
        type: 'object',
        properties: {
          subtaskId: { type: 'string', description: '子任务 ID' },
          taskKeyword: { type: 'string', description: '父任务标题关键词' },
          title: { type: 'string', description: '子任务标题关键词' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '搜索知识库文档。根据关键词匹配文档标题和内容。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_knowledge',
      description: '总结知识库文档。可通过 docId 或关键词定位文档，调用 AI 生成摘要。',
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string', description: '文档 ID' },
          keyword: { type: 'string', description: '文档标题关键词，用于模糊匹配' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_knowledge',
      description: '基于知识库文档进行问答。可通过 docId 或关键词定位文档，提出问题由 AI 基于文档内容回答。',
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string', description: '文档 ID' },
          keyword: { type: 'string', description: '文档标题关键词，用于模糊匹配' },
          question: { type: 'string', description: '要提问的问题' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '联网搜索。根据关键词搜索互联网信息并返回结果。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
]

const TOOL_ACTION_MAP: Record<string, Record<string, string>> = {
  task: { create: 'create_task', update: 'update_task', complete: 'complete_task', delete: 'delete_task', search: 'search_tasks' },
  task_list: { create: 'create_task_list', update: 'update_task_list', delete: 'delete_task_list' },
  subtask: { create: 'create_subtask', toggle: 'toggle_subtask', delete: 'delete_subtask' },
  note: { create: 'add_note', update: 'update_note', delete: 'delete_note', search: 'search_notes' },
  knowledge: { search: 'search_knowledge', summarize: 'summarize_knowledge', ask: 'ask_knowledge' },
  workspace: { overview: 'get_overview', navigate: 'navigate', theme: 'set_theme', coin_flip: 'coin_flip' },
  ai_config: { get: 'get_ai_config', update: 'update_ai_config' },
}

const ROLE_PERSONAS: Record<string, string> = {
  study: '你当前处于「学习模式」：用教练式、循循善诱的方式帮助用户理解概念，多用类比、提问引导思考，鼓励动手实践。',
  work: '你当前处于「工作模式」：高效、结构化、结果导向。优先给出可执行步骤、清单与要点，少废话。',
  chat: '你当前处于「闲聊模式」：轻松、亲切、像朋友一样陪聊，可适当幽默，不必每次都调用工具。',
}

export { CHAT_TOOLS, TOOL_ACTION_MAP, ROLE_PERSONAS }
