export type StageOption = { id: number; parent_id: number | null; ordem: number; nome: string; cor?: string }
export const formatStageLabel = (stage: Pick<StageOption, 'ordem' | 'nome'> | null | undefined) => stage ? `ETAPA ${stage.ordem} - ${stage.nome}` : '—'
export const parentStage = (stage: StageOption, stages: StageOption[]) => stage.parent_id ? stages.find((item) => item.id === stage.parent_id) ?? stage : stage
export const formatStageOption = (stage: StageOption, stages: StageOption[]) => formatStageLabel(parentStage(stage, stages))
export const formatStageSelectionOption = (stage: StageOption, stages: StageOption[]) => stage.parent_id ? `${formatStageLabel(parentStage(stage, stages))} / ${stage.nome}` : formatStageLabel(stage)
export const scheduleStageColorClass = (position: number) => `stage-color-${position % 8}`
