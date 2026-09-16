export type StageOption = { id: number; parent_id: number | null; ordem: number; nome: string; cor?: string }
export const formatStageLabel = (stage: Pick<StageOption, 'ordem' | 'nome'> | null | undefined) => stage ? `ETAPA ${stage.ordem} - ${stage.nome}` : '—'
export const parentStage = (stage: StageOption, stages: StageOption[]) => stage.parent_id ? stages.find((item) => item.id === stage.parent_id) ?? stage : stage
export const formatStageOption = (stage: StageOption, stages: StageOption[]) => formatStageLabel(parentStage(stage, stages))
export const formatStageSelectionOption = (stage: StageOption, stages: StageOption[]) => stage.parent_id ? `${formatStageLabel(parentStage(stage, stages))} / ${stage.nome}` : formatStageLabel(stage)
export const scheduleStageColorClass = (position: number) => `stage-color-${position % 8}`
export const stageColorClassFromOrder = (order: number | null | undefined) => scheduleStageColorClass(Math.max(0, Number(order || 1) - 1))

export const stageBadgeStyle = (color: string | null | undefined) => {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return { backgroundColor: color, color: luminance > 160 ? '#3e493f' : '#ffffff' }
}
