// Passphrase word list: common lowercase English words, 3 to 8 letters, unique, no offensive terms.
// Tests assert length, uniqueness, and the character pattern.
const RAW = `
able acid acre across act add adult afar afield agent agile ahead aim air alarm album alert alike alive alley
allow almond alpha alter amber anchor angel angle ankle apple apron arch arena argue arise armor army aroma
arrow artist ascend ash aside aspen asset atlas attic audio auntie autumn avenue award aware axis bacon badge
bagel baker balance bamboo banana banner barn basil basin basket batch beach beacon bean bear beauty beaver
bell belt bench berry bike birch bird bison blade blanket blaze bloom blossom blue board boat bold bolt bonus
book boost border bottle bounce brave bread brick bridge brief bright brisk broom brush bubble bucket budget
buffalo bugle builder bulb bundle burrow butter button cabin cable cactus cake camel camera canal candle canoe
canvas canyon cape cargo carpet carrot castle cedar cello cereal chain chair chalk champ chapel charm chart
chase cheese cherry chess chest chief child chime chimney chin chirp choice chorus cider cinder circle citrus
civic clam clay clean clever cliff climb clock cloth cloud clover coach coast cobalt cocoa coffee coin collar
comet common copper coral cordial cork cotton couch cougar cover coyote crane crater crayon cream creek crest
cricket crisp crow crown crumb crystal cubic cup curl cushion cycle dagger daisy dance dawn decal deer delta
denim desert design detail dial diamond diary dinner dish ditch dodge dolphin donut dragon drape dream drift
drum duck dune eagle earth easel echo eclipse eddy edge eel elbow elder elephant elm ember emerald empty
engine enjoy envoy epic equal ermine essay estate ether evening exact fabric falcon fancy farm fawn feather
fellow fern ferry fiber field fig finch fjord flame flannel flask fleet flint flute focus fog foil forest fork
fossil fox frame fresh frost fruit fudge gadget galaxy garden garlic gate gather gazelle gecko gem giant
ginger giraffe glacier glade glass glove glow goat golden gorilla gossip grain grape graph grass gravel green
grid guitar gull habit hammer harbor harvest hawk hazel heart hedge helmet hemp herb hero hickory hill hinge
hippo honey hook hornet horse hover hub humble hunter iceberg icon igloo indigo inlet iris iron island ivory
ivy jacket jaguar jasmine jelly jewel jigsaw jolly journey juice jungle juniper kayak kettle kidney kingdom
kiosk kitten kiwi knife knight koala lace ladder lagoon lake lamb lamp lantern larch laser lattice laurel lava
lawn leaf lemon lentil lever lilac lily limit linen lion lizard llama lobster locust lotus lounge lunar lynx
magnet maple marble marsh meadow melon meteor mirror mitten mocha module mohair moment monarch moose morning
mosaic motor mountain mural museum music nectar needle nephew nest nickel nimbus noble nomad north notch
nugget oak oasis oat object ocean olive omega onion opal orange orbit orchid otter outer oval oyster paddle
paint palace panda panel panther paper parrot pasta patch path pebble pelican penny pepper perch petal piano
picnic pigeon pilot pine pioneer pixel planet plaza plenty plum plume pocket poem polar pond poplar poppy
porch possum potato pouch prairie prism pulse pumpkin puppy quail quartz quest quiet quill quilt radar raisin
rapid raven reed reef relic remix resin ribbon river robin rocket rodeo rooftop rose ruby saddle safari sage
salmon sand sapphire satin sauce scarf scenic scout sea seal season sequin sesame shadow shale shark shelf
shell shore sierra signal silk silver simple siren sketch slate sleigh slope smile snail snow soap socket
solar sonata sparrow spark spear sphinx spice spiral spring spruce square squid stable stair stamp star steam
steel stem stone storm stove stream street stripe studio sugar summit sunny surf swallow swamp sweater swift
table talent tangle tassel teal temple tender tennis thistle thread thunder ticket tiger timber toast token
tomato topaz torch tower trail train tulip tundra turkey turtle twig twilight umbrella union upland urban
valley vanilla velvet venture verse vessel violet violin vista vivid voyage walnut wander wasp water wave
weaver wheat whistle willow window winter wizard wolf wonder yacht yarn yellow yogurt zebra zenith zephyr zinc
zodiac zone abbey abbot abode abound accent accord acorn actor adage adobe advice affix agency agenda agree
aisle alder alibi allot aloft amend ample amuse anagram anchovy antler anvil apex apricot aqua arbor archer
area argon armada artful ascot aspect astral attach auburn auger auk aura avid azure bagpipe bakery balmy
bandit banjo barley baron barrel basalt bassoon battle bayou beehive beetle begin beige belfry bellow beryl
bevel biscuit blimp blizzard blouse bluff bobcat bonnet booth borax bosom bounty bower bramble brass breeze
brine brook brow bunny burlap cabbage cadet cairn calico calm cameo canary candy cannon canopy cantata caper
caravan cardinal carmine carol cascade casino cassava castor cavern celery cellar cement cerise chalet cherub
chevron chicory chili chintz chisel chorale chowder cinema cipher clamp clarinet clasp clear clerk cobble
cocoon coffer cognac colt comic compass compose condor copse cornet corsage cosmic cotta coupon cove cowboy
cowl crab crayfish creed crescent crimson crocus croquet crossbow crumble crypt cuckoo cumin cupola curry
cutlass cypress dahlia damson dapple dart dealer debate decree dingo dipper divan docket dolly domino dorado
dove dowel drake drawl dredge drizzle drone dulcet dunes durable dynamo earnest eaves ebony eclair edict eider
elated element elfin elixir emblem emu enamel encore endive enigma ensign entrance epoch equator escape
estuary ethos exile fable falter fanfare fathom fauna feast feldspar fennel ferret fervor fiddle figment
finial finale fire fishing flax fleece flicker flight flock flora flower fluent foliage forge formal fortune
fragment freesia fresco friar frolic fulcrum furrow gable gallery gamble garnet gasket gentle geode gerbil
geyser gibbon glider globe gloss goblet golf gondola gopher gourd granite gravity grebe grotto guava gumbo
gypsum halo hamlet harp hatch haven hazard heather heron hexagon hibiscus hiking hobby holly homely hornbeam
hound hovel hubcap humming hyacinth hymn icicle impala indoor ingot inkwell insect jackal jasper javelin jetty
jogger jubilee judo juggle kale kelp keystone kindle kinsman kilt kipper kite knoll kumquat lament lance lapis
larva lasso latch lavender ledger legend lemur lesson levee libra lichen lilt limpid lineage linnet lintel
lively loam locket loft lolly lore lucid lumber lyric macaw magpie mallard mammoth mandolin mango mantle
marigold marmot marquee mascot matador meerkat mellow mentor mesa method midge mildew millet mineral minnow
minstrel mint miracle mistral mortar mosquito mulberry muffin mustard myrtle mystic nacre napkin narwhal
nebula nettle nexus nightjar nougat novel nutmeg nylon oakum obelisk oboe ocelot octave odyssey offset ogre
omelet onyx opera optic orca orchard origami osprey ostrich ounce outpost oxide paisley palette pampas panama
pansy papaya parable paradox parsley pastel pauper pavilion peacock pecan pedal pelt pennant peony percale
perfume pewter phantom pheasant phoenix piccolo pickle pigment pilgrim pinwheel pistol pitch placid plaid
plains plankton plinth plover plunge pointer polka pollen pommel poncho poodle portal postage potion prawn
prelude presto prodigy prompt propane prose protest puffin pumice puzzle pyramid quaver quiver quota rabbit
racket radish rafter raider rampart ranger rapier rattle rayon realm rebel recess relay remedy repose retina
rhythm riddle rifle rigging rivet robust rookie rosary rumba rustic sable saffron sailor salsa sandal sapling
satchel saucer savanna scallop scalpel scepter schooner scribe scroll sculpt seaweed sedan sequel serene
sextant shackle shallot shamrock sheaf shepherd sherbet shingle shrimp sickle silo sincere sip sirocco skiff
skillet skylark slipper smelt snippet soprano sorrel spatula spinach splash sponge spoon sprout squash
stallion stencil stoat stucco stylus sumac sundial sunset supper sutra swivel sycamore syrup tablet tabby
tadpole talon tamarind tambour tapestry tarragon tartan taupe tavern teacup teakwood teaspoon tempo tenor
terrace terrier thimble thorn throne thyme tidal timpani tinsel tinted tiptoe titan toffee tonic topiary
torrent tortoise toucan trellis tribute trinket trombone trout trumpet tuba tulle tumble tunic turnip tutor
tweed typhoon ulster umber uplift upshot urchin utopia vapor varnish vellum veneer verbena vermin vertex
vesper viola viper vinyl vizier vulture wafer wagon walrus wampum wattle weasel welder wicket widget wigwam
wildcat winnow wisdom wombat wrangler wren yardarm yearling yeoman yonder yucca zealot zircon zither zucchini
`;

export const WORDS: readonly string[] = RAW.trim().split(/\s+/);
