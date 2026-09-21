# ELAB Sentence Chunking V1 Education Policy

## 목적

Chunking은 학생이 긴 영어 문장을 작은 의미 단위로 읽으면서 주어–동사 골격, 수식 범위, 종속절의 시작과 끝을 놓치지 않도록 돕는 읽기 활동이다. 문법 용어를 암기하거나 parser tree를 재현하는 활동이 아니다.

## Chunk 정의

`CHUNK`는 **학생이 한 번에 읽고 다음 의미와 자연스럽게 연결하기 좋은 최소 의미 단위**다.

Chunk는 다음과 동일하지 않다.

- 모든 clause boundary
- 모든 전치사구·to부정사·분사구
- dependency subtree
- 직역 단위 또는 한국어 어순 단위

학생 화면에는 문장과 slash 결과만 보여주고 clause type, parent/depth, finite/head 같은 내부 정보는 노출하지 않는다.

## 교육 원칙

1. 주어·동사 관계가 잘 보이도록 한다.
2. 종속절·관계절·비교절의 진입 지점은 우선 후보로 본다.
3. 긴 수식어는 골격과 분리할 수 있지만 짧은 수식어는 불필요하게 나누지 않는다.
4. 의미적으로 결합된 학생 동사구 내부는 기본적으로 자르지 않는다.
5. punctuation은 유력한 근거지만 쉼표마다 자동으로 자르지 않는다.
6. 너무 짧은 1-token chunk가 연속되지 않도록 한다.
7. 문법 구조가 있다는 이유만으로 slash를 추가하지 않는다.

## 구조별 boundary 후보

| 구조 | 기본 판단 |
|---|---|
| 주절 골격 | 긴 선행 수식어 뒤 또는 완결된 골격 뒤를 후보화 |
| that/whether/if/because/when/although/while | marker 앞을 우선 후보화 |
| 관계절 | 관계 marker 앞을 후보화; 짧고 필수적인 관계절은 교사가 유지 가능 |
| 긴 PP | 길이·attachment가 골격을 가릴 때만 후보화 |
| to-V | 독립 목적/부가 의미면 후보; teacher student verb span 내부면 억제 |
| V-ing/p.p. | 부가·수식·별도 해석 단위일 때 후보; 동사구 내부면 억제 |
| 병렬 | 병렬항이 길거나 서로 독립된 의미 단위일 때 후보화 |
| than / as ... as | 비교절 진입 지점을 후보화 |
| 삽입·부가 정보 | 앞뒤 경계를 함께 후보화 |
| 긴 주어–동사 거리 | 주어 내부를 자르기보다 주어 완결 뒤 boundary를 우선 |

## 과분절 방지

다음은 기본적으로 하나로 유지한다.

- `has been studying`, `can solve`, `are excited`
- `needs to be done`처럼 Teacher student verb span으로 확정된 의미 동사구
- determiner + noun, adjective + noun, particle을 포함한 확정 동사구
- 짧은 전치사구가 핵심 명사·동사와 강하게 결합된 경우

예를 들어 `wanted / to get rich ...`는 구조 파악을 위해 나눌 수 있지만 `wanted to get`을 기계적으로 항상 나누거나 항상 합치지 않는다. Chunking은 기존 verb policy를 변경하지 않고 그 결과를 no-split feature로 사용한다.

## 예시

가능한 대표안:

> Greenwashing involves /  
> misleading a consumer into thinking /  
> a good or service is more environmentally friendly /  
> than it really is.

이는 설계 예시일 뿐 Pilot Teacher Gold를 미리 지정한 것이 아니다. `mislead A into V-ing` 같은 `VERB_PATTERN`은 별도 Interpretation Feature로 남으며, feature 존재만으로 slash를 만들지 않는다.

## Level과의 관계

S1–S5는 기존 구조 난이도로 고정한다. Chunk 수로 Level을 재계산하지 않는다. Level은 연습 문장 선정과 단계적 노출에만 사용한다.

- S1: 짧은 골격, slash가 없거나 매우 적음
- S2: 골격과 수식·비정형 표현 구분
- S3: 기본 종속절 진입
- S4: 여러 절·삽입·중첩
- S5: 복수 구조를 통합해 읽기

## V1 정답 정책

V1은 `teacher_primary_chunks` 한 세트만 canonical 정답으로 사용한다. 복수 정답이 실제 Pilot에서 반복될 때만 `teacher_acceptable_chunk_variants[]`를 활성화한다. 처음부터 가능한 모든 끊기 조합을 정답으로 만들지 않는다.

## Freeze

Chunking은 Subject, Verb Span, S1–S5, candidate classifier, gate, Gold41을 수정하지 않는다.
