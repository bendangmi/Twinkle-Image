'use client';

import { cn } from '@/lib/utils';
import { findModel, type InstalledPlugin } from '@/lib/plugin-schema';

const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };

function symbolFor(currency?: string): string {
  if (!currency) return '¥';
  return CURRENCY_SYMBOL[currency] || `${currency} `;
}

/**
 * 单价标签。价格来自插件 manifest 的申报值——开源版不代理任何上游价格接口，
 * 所以这里显示的是插件作者写死的申报价，未申报时明说「未申报」而不是显示 ¥0.00。
 */
export function PluginPriceTag({
  plugin,
  modelId,
  className,
}: {
  plugin: InstalledPlugin;
  modelId: string;
  className?: string;
}) {
  const price = findModel(plugin, modelId)?.price;
  if (!price) {
    return <span className={cn('text-[10px] text-muted-foreground/60', className)}>价格未申报</span>;
  }
  const unit = price.unit === 'per-second' ? '/秒' : '/次';
  return (
    <span className={cn('font-mono text-[10px] tabular-nums text-muted-foreground', className)}>
      {symbolFor(price.currency)}{price.amount}{unit}
    </span>
  );
}

/** 合计价格。cost 为 null 表示插件没申报价格或数量字段缺失。 */
export function PluginTotalPrice({
  plugin,
  modelId,
  cost,
  className,
}: {
  plugin: InstalledPlugin;
  modelId: string;
  cost: number | null;
  className?: string;
}) {
  const price = findModel(plugin, modelId)?.price;
  if (cost === null) {
    return <span className={cn('text-xs text-muted-foreground/70', className)}>价格未申报</span>;
  }
  return (
    <span className={cn('font-mono text-sm font-semibold tabular-nums text-primary', className)}>
      {symbolFor(price?.currency)}{cost.toFixed(2)}
    </span>
  );
}
