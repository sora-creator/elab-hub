# R6 Narrow Refinement Report

## Change

Before creating an R6 candidate, the generator now checks for a parser-confirmed `have/need + to + V` necessity chain. Confirmed chains suppress only the R6 candidate at that junction.

No blanket student-verb-span rule was added. The implementation is lexical and structural: recognized `have/has/had/need/needs/needed`, `TO` with auxiliary dependency, and a downstream verb head one or two parser tokens after `to`.

## Required fixtures

Protected:

- `have to do`
- `has to leave`
- `had to wait`
- `will have to leave`
- `need to recruit`
- `needs to be done`

Not protected:

- `try to solve`
- `wanted to get rich`
- `planning to discontinue`
- `decided to stop`

All fixtures pass.

## Pilot12 shadow result

| Metric | Before | After |
|---|---:|---:|
| R6 proposals | 4 | 2 |
| R6 false splits | 2 | 0 |
| Correct R6 proposals retained | 2 | 2 |
| New missed boundaries | 0 | 0 |

The retained proposals are `wanted｜to` and `try｜to`. The suppressed proposals are `have｜to` and `needs｜to` in corpus:59087.

## Regression

- R1/R2/R3/R4/R5/R7/R8/R9 candidate signatures: unchanged
- FOUNDATION: unchanged
- BEGINNER: unchanged
- V5 expressions: unchanged
- Teacher canonical SHA-256: `d4553ca72e70a65b11568918587b879250e77f63a2a6e00e741b2c16f0acfa9b`
- Teacher canonical semantic/byte-equivalent: PASS
