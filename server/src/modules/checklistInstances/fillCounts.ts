import { pct, round1 } from "../scores/scoreFormulas.js"

export type FillRunState = "done" | "late" | "missed" | "open"

export type QuestionTally = { questionsDue: number; questionsDone: number }

export type FillCounts = QuestionTally & { questionsPct: number | null; answersGood: number; answersChecked: number }

export const emptyQuestionTally = (): QuestionTally => ({ questionsDue: 0, questionsDone: 0 })

export const addRunQuestions = (into: QuestionTally, run: { state: FillRunState; total: number; done: number }) => {
    if (run.state === "open") return
    into.questionsDue += run.total
    into.questionsDone += Math.min(run.done, run.total)
}

export const fillCountsOf = (questions: QuestionTally, answersGood: number, answersChecked: number): FillCounts => ({
    questionsDue: questions.questionsDue,
    questionsDone: questions.questionsDone,
    questionsPct: pct(questions.questionsDone, questions.questionsDue),
    answersGood: round1(answersGood) ?? 0,
    answersChecked: round1(answersChecked) ?? 0,
})
