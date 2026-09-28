export const DEFAULTS = Object.freeze({
  source: 'harness', mode: 'concise', baseURL: '', model: '', protocol: 'chat', omitStore: false,
});

export const MODES = Object.freeze({
  concise: { label: '精炼增强', hint: '澄清目标、去重；约 800 字软目标，不牺牲原始信息。' },
  detailed: { label: '深度增强', hint: '在原范围内补足输入、边界、交付物与验收，不擅自扩需求。' },
  creative: { label: '创意增强', hint: '发展开放式想法；少量可选方向与必做要求明确分开。' },
});

export function captureDraft(input) {
  return { draft: input.draft, draftRev: input.draftRev, attachmentIds: [...input.attachmentIds] };
}

export function draftConflict(before, now, { active = true, composing = false } = {}) {
  if (!active) return '输入框或会话已切换';
  if (composing) return '正在使用输入法';
  if (now.phase !== 'plain') return '输入框正在处理命令或发送';
  if (now.occurrences.length) return '草稿含原生引用标签，不能按纯文本覆盖';
  if (now.draftRev !== before.draftRev || now.draft !== before.draft) return '草稿已被编辑';
  if (now.attachmentIds.length !== before.attachmentIds.length || now.attachmentIds.some((id, i) => id !== before.attachmentIds[i])) return '附件已变化';
  return '';
}

export function protectedContentIssue(before, after) {
  // These are evidence in a prompt, not code for the enhancer to execute or repair.
  const literals = [], fence = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  let outside = '', cursor = 0, opening;
  while ((opening = fence.exec(before))) {
    const close = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}[ \\t\\r]*(?=\\n|$)`, 'gm');
    close.lastIndex = fence.lastIndex;
    const closing = close.exec(before);
    if (!closing) break;
    const end = closing.index + closing[0].length;
    literals.push(before.slice(opening.index, end));
    outside += before.slice(cursor, opening.index) + '\n';
    cursor = fence.lastIndex = end;
  }
  outside += before.slice(cursor);
  literals.push(...(outside.match(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g) ?? []));
  if (literals.some(part => !after.includes(part))) return '模型改动了原文代码块或内联代码';
  // Harness deliberately strips these private reference markers on every paste.
  if (/[\uE100-\uE11D\uFFFC]/u.test(after)) return '结果含输入框不支持的引用占位符';
  return '';
}
