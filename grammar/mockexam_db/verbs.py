# -*- coding: utf-8 -*-
"""
Built-in English verb data used by the rule-based grammar tagger.

NOTE ON WHY THIS EXISTS:
This sandbox's network access is restricted to PyPI, so a real NLP model
(spaCy's en_core_web_sm, NLTK's POS tagger data, etc.) could not be
downloaded -- those are hosted on GitHub/raw.githubusercontent.com /
huggingface.co, all of which are blocked here. Instead of a trained
parser, this tagger uses curated word lists + regex heuristics. It will
not be 100% accurate (some false positives/negatives are expected on
tricky sentences) -- treat its output as a strong first pass to be
spot-checked, not ground truth.
"""

BASE_VERBS = set("""
be have do say go get make know think take see come want look use find give
tell work call try ask need feel become leave put mean keep let begin seem
help talk turn start show hear play run move like live believe hold bring
happen write provide sit stand lose pay meet include continue set learn
change lead understand watch follow stop create speak read allow add spend
grow open walk win offer remember love consider appear buy wait serve die
send expect build stay fall cut reach kill remain suggest raise pass sell
require report decide pull return explain hope develop carry break receive
agree support hit produce eat cover catch draw choose cause point listen
realize place close teach reveal press answer improve increase respond
treat arrive ensure collect claim describe apply reduce establish
drive express prevent identify recognize achieve gain
maintain determine avoid discuss remove replace involve refer manage protect
notice publish encourage compare complete regard affect force
introduce accept perform train obtain recall attend attempt fail
communicate contribute distinguish extend indicate handle imagine
interpret invest issue join launch limit link measure mention monitor
operate organize plan prepare promote propose prove reflect refuse relate
release rely repeat represent request resolve restore retain
review reward search secure separate settle share shift shoot
shape sign simplify solve state stress structure succeed suffer
supply surprise survive target tend threaten transfer
transform trust update urge value view visit volunteer vote wonder wish
accomplish acknowledge acquire adapt adjust admire admit adopt advance
advertise advise afford aim alert analyze announce annoy
anticipate apologize appeal appoint approach approve argue arrange arrest
assemble assess assign assist assume assure attach attack attract award
balance ban base battle beat behave belong bend bet bind bite blame bless
block blow boil book boost bother bounce bow branch breathe breed brush
bump burn burst bury calculate campaign capture care carve celebrate
challenge charge chase chat cheat check cheer chew choke chop clap
classify clean clear climb clip coach collapse combine command commit
compete complain compose comprise conclude conduct confess confirm connect
conserve construct consult consume contact contain convert convince cook
cool cope copy correct correspond count crash creep crush cry cure
curve cycle damage dance date deal declare decorate defeat defend define
delay delete deliver demand demonstrate deny depend deposit derive descend
design desire despise destroy detect deteriorate devote dig
disappear discover dislike display dispose dissolve distribute disturb
dive divide dominate donate doubt download drag drain dream dress drink
drop dry earn ease edit educate elect eliminate embarrass embrace emerge
emphasize employ empty enable encounter endure enforce engage enhance
enjoy enroll enter entertain envy equip escape estimate evaluate examine
exceed exchange exclude excuse execute exercise exhaust exhibit exist expand
experience experiment explode explore export expose extract face facilitate
fade fasten fear feature fetch fight file fill film finish fit fix flee
float flood flow fly focus fold forbid forecast foresee forgive
form format found frame free freeze frighten fry fulfill fund gather
generate glance glow govern grab grant grasp greet grip guarantee guard
guess guide handle hang harm harvest hate haunt heal heat hesitate hide
hike hire honor hop hunt hurry hurt ignore illustrate
implement imply import impose impress incorporate
influence inform inhabit inherit initiate injure inspect inspire install
instruct insult insure integrate intend interact interfere interrupt
invade invent investigate invite isolate jump
justify knit knock label lack land last laugh launch lay lean leap lend
license lift light limit list load lock log loosen lower
manufacture march mark market marry match matter maximize melt
mention merge migrate milk mind minimize mislead miss mix mold mount
multiply murder name navigate negotiate nod normalize notify nourish
obey object observe occupy occur offend omit oppose order overcome
overlap overlook overtake owe own pack paint park participate pass paste
patrol pause peel penetrate perceive permit persist persuade phone pick
picture pierce pile pin pinch pioneer pitch place plant plead please plug
plunge poison poke polish pop pose position possess post postpone pound
pour practice praise pray preach precede predict prefer pretend
prevail price print proceed process proclaim program
progress prohibit project promise pronounce protect
protest provoke pump punch punish purchase pursue push qualify
quit quote race radiate range rank rate react rearrange
reassure rebuild recover recruit
recycle redesign reform refresh register
regret regulate reinforce reject relax relieve remark
remind render renew rent repair reply
reproduce rescue research resemble resent
reserve reset reside resign resist resort respect restrict resume
retire retreat reverse revise revive rid ride ring rise risk roast rob
roll rot rotate rub ruin rule rush sacrifice sail satisfy save scan scare
scatter schedule scold scrape scratch scream screen screw scrub seal
season seat seek seize select sense sequence sew shake shed
shelter shine ship shock shorten shout shove shrink shrug sigh
signal signify sing sink sip site situate ski skip slam slap slice slide
slip slow smell smile smoke smooth snap sneak sniff soak soar sob soften
sort sound spare spark sparkle specialize specify speculate spell spill
spin spit split spoil spot spray sprinkle spy squeeze stab stack stain
stamp stare starve steal steer stick stimulate sting stir stitch stock
store strain strap strengthen stretch strike strip strive stroke stroll
struggle study stuff stumble subdue submit subscribe substitute suck
suit sum summarize summon supervise suppose suppress surf surface surpass
surrender surround survey suspect suspend swallow swear sweat sweep swell
swing switch symbolize sympathize synthesize tackle tag tap taste tear
tease telephone temper tempt terrify test testify text thank thaw thicken
thin thread thrill thrive thrust tidy tie tighten tilt time tip tire
toast tolerate torture toss touch trace track trade trail transmit
transport trap travel treasure tremble trick trigger trim trip triumph
trouble tuck tug tumble tune twist type undergo undermine undertake
unify unite unlock unpack upgrade uphold upset utilize
vacate vanish vary venture verify vibrate violate visualize
voice vomit wake wander warm warn wash waste wave weaken wear weave weep
weigh welcome whisper whistle widen wind wipe withdraw wither withstand
witness worry wrap wreck wrestle wring yell yield zoom
""".split())

IRREGULAR_PAST_PARTICIPLES = set("""
been born borne beaten begun bent bet bitten bled blown broken brought
built burnt bought caught chosen clung come cost crept cut dealt dug
done drawn dreamt driven drunk eaten fallen fed felt fought found flown
forbidden forgiven forgotten forgone forsaken frozen given gone gotten
grown had heard held hidden hit hung hurt kept knelt knit known
laid led leapt learnt left lent let lit lost made meant met mistaken
mown overcome paid proven put quit read rid ridden rung risen run said
sat seen sent set sewn shaken shed shod shone shot shown shrunk shut
sung sunk slept slid slain smelt sold sought sown spent spilt spit split
spoken spread sprung stolen stood stuck stung stunk stridden struck
strung striven sworn swept swollen swum swung taken taught torn told
thought thrown thrust trodden understood undertaken upheld upset woken
withdrawn withheld withstood worn woven won wound written wrought
""".split())

ING_STOPWORDS = set("""
during according morning evening thing things something nothing anything
everything spring string ring king wing sibling darling building meeting
setting painting drawing reading writing feeling meaning training housing
bedding clothing wedding ceiling opening ending beginning gathering
understanding surrounding outstanding warning offering pudding
""".split())
