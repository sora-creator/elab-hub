# Chunking Pilot12 Plan

## 목적과 고정 조건

Pilot12는 parser 정확도 시험이 아니라 교사가 실제로 가르칠 대표 chunk를 표시해 교육 정책을 만드는 세트다. 전부 기존 Teacher Gold 문장을 재사용하며 Subject/Verb/Level/Gold를 수정하지 않는다. 사전 chunk 정답은 넣지 않는다.

## Queue

| 순서 | ID | Level | 문장 | 검증 목적 |
|---:|---|---|---|---|
| 1 | `corpus:2970` | S1 | Identity then became a problem. | slash가 불필요할 수 있는 clean baseline; discourse adverb 과분절 방지 |
| 2 | `corpus:25018` | S1 | We all know this feeling. | 짧은 주어 덩어리와 no-split baseline |
| 3 | `corpus:2449` | S2 | We are organizing a drone show for the local community and are excited about this special event. | 병렬 predicate와 두 의미 단위의 경계 |
| 4 | `corpus:2590` | S2 | They wanted to get rich quick and blow their money on fast cars and expensive champagne. | `want + to-V`와 병렬 bare verb; verb span과 chunk 차이 |
| 5 | `corpus:2479` | S3 | Scientists often publicly speculate that we can probably expect surprises here, too. | 기본 that/content clause 진입 |
| 6 | `corpus:58378` | S3 | We all negotiate every day, whether we realise it or not. | whether 부사절과 짧은 main/subordinate 균형 |
| 7 | `corpus:26237` | S3 | Each course consists of ten units that help improve your drawing and story-telling skills. | 관계절 진입, 일반 PP, bare infinitive 과분절 방지 |
| 8 | `corpus:2501` | S4 | The above graph, which was based on a survey conducted from April of 2022 to March of 2023, shows the percentages of respondents in four countries who used different methods of payment. | 긴 삽입 관계절과 두 번째 관계절; 주어–동사 거리 |
| 9 | `corpus:23568` | S4 | Greenwashing involves misleading a consumer into thinking a good or service is more environmentally friendly than it really is. | V-ing pattern, omitted-that content, comparison `than` |
| 10 | `corpus:2581` | S4 | If you try to pull apart two blocks of wood that have been nailed together, the wood fibers grip the shaft of the nail. | 부사절+관계절+particle; 확정 동사구 내부 no-split |
| 11 | `corpus:2480` | S5 | They assume that all animals that live in herds or large groups possess similar brain mechanisms, because social units function only if individuals can see things from the perspective of others in the group and feel what they are feeling. | 6개 절 후보, 중첩·병렬 predicate·긴 attachment |
| 12 | `corpus:59087` | S5 | If you hate the thing you do but have to do it nonetheless, you have choice between hating the thing and accepting that it needs to be done. | 부사절·관계절·that절·nonfinite 병렬; `needs to be done` no-split |

## Level 분포

- S1: 2
- S2: 2
- S3: 3
- S4: 3
- S5: 2
- Total: 12

## 구조 coverage

- simple/no-split baseline
- modifier-heavy and long S–V distance
- that/content clause
- relative clause
- adverbial/whether/if clause
- to-V and V-ing
- coordination and parallel predicates
- comparison clause
- parenthetical/insertion
- nested structure
- phrasal particle
- difficult `VERB_PATTERN`

## Entry readiness

모든 문장은 기존 Teacher Gold이며 PDF/source가 이미 확인됐다. Chunking Teacher state는 새 namespace에서 0/12로 시작한다. 기존 Gold41 state를 복사하거나 변경하지 않는다.
