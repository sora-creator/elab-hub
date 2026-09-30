# S/V Continuation Grammar Validation

## Decision

Student STEP 1 should not alternate `SUBJECT → VERB → SUBJECT → VERB` mechanically.
The next target is derived from the frozen Teacher canonical clause/predicate sequence:

- a new finite clause contributes a subject and its finite/student verb span;
- an additional predicate in the same clause contributes another verb target, not another subject target;
- a non-finite complement does not create a new student S/V pair unless the Teacher canonical annotation contains a separate finite clause.

Surface token patterns are not used to invent clauses. This is especially important for omitted `that`, omitted object relatives, infinitives, participles, auxiliary chains, and passive chains.

## Theory validation

| Topic | Grammar theory | Teacher canonical interpretation | UI next target |
|---|---|---|---|
| Simple finite clause | A finite clause contains a finite verb and normally a subject. | One reviewed clause, one predicate. | `SUBJECT → VERB → COMPLETE` |
| Explicit that-clause | A that-clause can function as a complement and contains its own clause structure. | Reviewed `NOUN_THAT`, overt marker. | New `SUBJECT`, then its `VERB` |
| Omitted that-clause | `that` may be omitted after reporting verbs such as *think*. Omission alone is not safely recoverable from a superficial token pattern. | Reviewed `NOUN_THAT`, zero marker. | New `SUBJECT`, then its `VERB` |
| Subject relative | A relative pronoun may be the subject of its relative clause. | Relative marker and subject refer to the same reviewed token. | Relative pronoun as `SUBJECT`, then `VERB` |
| Object relative | A relative pronoun may be the object; a separate subject follows. | Reviewed overt relative with `subject_is_marker=false`. | Separate `SUBJECT`, then `VERB` |
| Omitted relative | In a defining relative clause, an object relative pronoun may be omitted; a subject relative pronoun is not omitted this way. | Reviewed zero-marker relative clause. | New `SUBJECT`, then `VERB` |
| Adverbial clause | Subordinators can introduce a finite subordinate clause. | Reviewed adverbial clause. | New `SUBJECT`, then `VERB` |
| Coordinated predicates | Two verb phrases can share one clause subject. | Multiple reviewed predicates under the same `clause_id`. | Stay on `VERB` |
| Coordinated clauses | Coordination can join separate clauses, each with its own S/V structure. | A following reviewed MAIN/finite clause has a new subject. | New `SUBJECT` |
| Wh / whether / if content clause | Interrogative/content clauses can occur as complements and contain a finite S/V structure. | Reviewed content-clause type. | New `SUBJECT`, then `VERB` |
| Non-finite complement | Infinitive, `-ing`, and `-ed` forms are non-finite; verb + infinitive/`-ing` can form a complement without a new finite subject. | No additional reviewed finite clause/predicate pair. | `COMPLETE` |

## Sources

- Cambridge Dictionary, [Clauses: finite and non-finite](https://dictionary.cambridge.org/us/grammar/british-grammar/clauses-finite-and-non-finite)
- Cambridge Dictionary, [Finite and non-finite verbs](https://dictionary.cambridge.org/grammar/british-grammar/finite-and-non-finite-)
- Cambridge Dictionary, [That-clauses](https://dictionary.cambridge.org/grammar/british-grammar/that-clauses)
- Cambridge Dictionary, [Verbs followed by a that-clause](https://dictionary.cambridge.org/grammar/british-grammar/that-clause)
- Cambridge Dictionary, [Relative pronouns](https://dictionary.cambridge.org/grammar/british-grammar/relative-pronouns/)
- Cambridge Dictionary, [Defining and non-defining relative clauses](https://dictionary.cambridge.org/grammar/british-grammar/PUBLIC_IDENTIFIER_REMOVED)
- Cambridge Dictionary, [Verb phrases](https://dictionary.cambridge.org/grammar/british-grammar/verb-phrases)
- Cambridge Dictionary, [Clauses](https://dictionary.cambridge.org/grammar/british-grammar/clauses-)

## Regression matrix

| Fixture | Grammar theory | Teacher canonical | Expected UI next target |
|---|---|---|---|
| A. Identity became a problem. | Simple finite clause | 1 subject, 1 predicate | `COMPLETE` |
| B. I think that he is right. | Explicit that-clause | MAIN + overt NOUN_THAT | `SUBJECT` (`he`) |
| C. I think he is right. | Zero-that content clause | MAIN + zero NOUN_THAT | `SUBJECT` (`he`) |
| D. the person who lives here | Subject relative | relative marker is subject | `SUBJECT` (`who`) |
| E. the person who I met | Object relative | separate relative-clause subject | `SUBJECT` (`I`) |
| F. the person I met | Omitted object relative | verified zero relative | `SUBJECT` (`I`) |
| G. She smiled and waved. | Coordinated predicates | one clause, two predicates | `VERB` (`waved`) |
| H. I stayed home but he went out. | Coordinated clauses | two finite clauses | `SUBJECT` (`he`) |
| I. I stayed home because I was tired. | Adverbial finite clause | MAIN + ADVERBIAL | `SUBJECT` (`I`) |
| J. They wanted to get rich quick and blow ... | Non-finite complement | one finite Teacher S/V pair | `COMPLETE` |
| K. corpus:23568 | Zero-that content + adverbial | three reviewed clauses | omitted-that `SUBJECT`, then adverbial `SUBJECT`, then `COMPLETE` |

The UI displays only student-facing Korean guidance. Internal reason codes, clause counts, predicate counts, and exact answer counts remain hidden.
