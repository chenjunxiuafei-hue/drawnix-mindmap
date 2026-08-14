import { parseMarkdownToDrawnix } from '@plait-board/markdown-to-drawnix';
import type { BoardValue } from './types';

const FALLBACK_TREE = {
  name: '电商运营体系',
  children: [
    { name: '店铺基础', children: [
      { name: '活动提报', children: [{ name: '小二活动提报' }, { name: '后台活动提报' }] },
      { name: '链接维护', children: [
        { name: '价格', children: [{ name: '价格设置', children: [{ name: '日常 / 大促折扣 / 闪购价格' }, { name: '清仓价格' }] }, { name: '价格校验' }] },
        { name: '库存', children: [{ name: '库存设置' }, { name: '库存更新跟进', children: [{ name: '海外仓' }, { name: '官方仓' }] }] },
      ] },
      { name: '素材维护 & 迭代', children: [
        { name: '店铺维度', children: [{ name: '日常', children: [{ name: '首页' }, { name: '链接关联页' }, { name: '链接精选' }] }, { name: '大促', children: [{ name: '首页' }, { name: '链接关联页' }, { name: '链接精选' }] }] },
        { name: '链接维度', children: [{ name: '日常', children: [{ name: '短主图' }, { name: '长主图 + 长主图轮播图' }, { name: '详情页' }, { name: '副图' }] }, { name: '大促', children: [{ name: '短主图 + 长主图' }, { name: '副图' }] }] },
      ] },
      { name: '物流维护', children: [{ name: '发货方式设置' }] },
      { name: '店铺健康维护', children: [{ name: '罚分监控' }, { name: '投诉工单监控' }, { name: '罚分消除' }, { name: '店群优选' }] },
    ] },
    { name: '品类', children: [{ name: '新品', children: [{ name: '上新跟进' }] }, { name: '老品', children: [{ name: '链接矩阵', children: [{ name: '链接优化框架' }] }] }, { name: '清仓品' }] },
    { name: '渠道', children: [
      { name: '站内', children: [{ name: '公域', children: [{ name: '平台活动' }, { name: '站内广告', children: [{ name: '店铺广告 - 品类词' }, { name: '品牌广告 - 首页广告' }] }] }, { name: '私域', children: [{ name: '客服' }, { name: '直播' }, { name: '联盟' }, { name: '会员' }, { name: '广播' }, { name: '优惠券' }] }] },
      { name: '站外', children: [{ name: '线上', children: [{ name: 'Meta 广告', children: [{ name: '合创' }, { name: '收割' }] }, { name: '谷歌广告' }, { name: '社媒发帖' }, { name: '营销种草', children: [{ name: '品牌营销' }, { name: 'IP 联名' }] }, { name: 'TikTok' }] }, { name: '线下', children: [{ name: '合作门店' }, { name: '快闪活动' }] }] },
    ] },
    { name: '团队', children: [
      { name: '人员管理', children: [{ name: '分工调整' }, { name: '筛选人才' }] },
      { name: '周会复盘', children: [{ name: '数据复盘' }, { name: '素材复盘' }] },
      { name: '月度规划' }, { name: '财务 ROI' }, { name: '打假' },
      { name: '行业数据收集', children: [{ name: '链接排名' }, { name: '人群数据' }, { name: '大盘数据 / 竞对数据' }] },
      { name: '价格监控', children: [{ name: '站内竞品价格监控' }, { name: 'TT 价格监控' }] },
      { name: '赠品采购' },
    ] },
  ],
};

type LooseNode = { name?: string; text?: string; data?: { text?: string }; children?: LooseNode[] };

function normalizeNode(node: any): LooseNode | null {
  if (!node || typeof node !== 'object') return null;
  const name = String(node.name ?? node.text ?? node.data?.text ?? '').trim();
  if (!name) return null;
  return { name, children: Array.isArray(node.children) ? node.children.map(normalizeNode).filter(Boolean) as LooseNode[] : [] };
}

function treeToMarkdown(root: LooseNode) {
  const title = String(root.name || '思维导图').replace(/\n/g, ' ');
  const lines = [`# ${title}`];
  const walk = (children: LooseNode[] = [], depth = 0) => {
    children.forEach((child) => {
      const name = String(child.name || '未命名').replace(/\n/g, ' ');
      lines.push(`${'  '.repeat(depth)}- ${name}`);
      walk(child.children || [], depth + 1);
    });
  };
  walk(root.children || []);
  return lines.join('\n');
}

export async function boardFromTree(root: LooseNode): Promise<BoardValue> {
  const markdown = treeToMarkdown(root);
  const mind: any = await parseMarkdownToDrawnix(markdown);
  mind.points = [[0, 0]];
  return { children: [mind] };
}

export async function blankBoard(title: string): Promise<BoardValue> {
  return boardFromTree({ name: title, children: [] });
}

export async function migrateLegacy(raw: string | null): Promise<BoardValue> {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.board?.children && Array.isArray(parsed.board.children)) return parsed.board as BoardValue;
      if (parsed?.children && Array.isArray(parsed.children) && !parsed.name && !parsed.data) return parsed as BoardValue;
      if (parsed?.tree?.data?.text) {
        const node = normalizeNode(parsed.tree);
        if (node) return boardFromTree(node);
      }
      const node = normalizeNode(parsed);
      if (node) return boardFromTree(node);
    } catch (err) {
      console.warn('旧数据迁移失败，将使用默认结构', err);
    }
  }
  return boardFromTree(FALLBACK_TREE);
}
