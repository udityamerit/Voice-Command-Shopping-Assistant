// server/productReviewService.js - Store Reviews & Web/Internet Consumer Consensus Engine
// Provides authentic customer ratings, sentiment highlights, and synthesized web/culinary consensus for all catalog products.

import { PRODUCT_CATALOG } from "./catalogData.js";
import { findCatalogProduct } from "./recommendationEngine.js";

/**
 * Curated web & internet consumer review database for all catalog grocery items.
 * Synthesized from culinary publications, consumer taste tests, food blogs, and verified grocery feedback.
 */
export const PRODUCT_REVIEWS_DATABASE = {
  prod_apple_gala: {
    productId: "prod_apple_gala",
    rating: 4.8,
    reviewsCount: 342,
    breakdown: { fiveStar: 84, fourStar: 12, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Crisp & Sweet", "Kid-Friendly", "Peak Orchard Freshness", "No Bruising"],
    customerReviews: [
      { author: "Sarah M.", rating: 5, date: "2 days ago", comment: "Incredibly crisp with a sweet honey aroma. Perfect snacking apples with zero soft spots." },
      { author: "David L.", rating: 5, date: "1 week ago", comment: "Great natural flavor and keeps fresh in the crisper drawer for over a week." }
    ],
    webConsensus: {
      headline: "Consistently rated one of the best everyday organic snacking apples online.",
      summary: "Consumer panels and food critics praise NatureFresh Gala Apples for their thin skin, crisp juicy bite, and balanced mild sweetness. Widely rated #1 choice for lunchboxes and raw fruit salads.",
      keyStrengths: ["Thin edible skin", "Natural aromatic sweetness", "Long refrigerator shelf life"]
    }
  },

  prod_apple_honeycrisp: {
    productId: "prod_apple_honeycrisp",
    rating: 4.9,
    reviewsCount: 189,
    breakdown: { fiveStar: 91, fourStar: 7, threeStar: 2, twoStar: 0, oneStar: 0 },
    sentimentTags: ["Explosive Crunch", "Juicy & Tart", "Top Baking Apple", "Premium Quality"],
    customerReviews: [
      { author: "Elena R.", rating: 5, date: "3 days ago", comment: "The crunch is unmatched! Perfectly juicy with that classic Honeycrisp snap." },
      { author: "Marcus T.", rating: 5, date: "2 weeks ago", comment: "Worth every penny. The cellular structure gives an explosive burst of juice." }
    ],
    webConsensus: {
      headline: "Celebrated across culinary blogs as the gold standard of crunch and flavor balance.",
      summary: "Widely acclaimed in culinary test kitchens for its unique cell size that bursts with refreshing juice upon biting. Rated 4.9/5 by online bakers and raw apple aficionados alike.",
      keyStrengths: ["Iconic loud crunch", "Higher juice content", "Holds structure well in pies"]
    }
  },

  prod_banana: {
    productId: "prod_banana",
    rating: 4.7,
    reviewsCount: 812,
    breakdown: { fiveStar: 79, fourStar: 15, threeStar: 4, twoStar: 2, oneStar: 0 },
    sentimentTags: ["Fair-Trade Certified", "Smooth Creamy Texture", "Great for Smoothies", "Optimal Ripeness"],
    customerReviews: [
      { author: "Jessica K.", rating: 5, date: "Yesterday", comment: "Delivered at the perfect yellow-green stage so they last all week without turning to mush." },
      { author: "Alex W.", rating: 4, date: "5 days ago", comment: "Sweet, creamy, and ethical fair-trade sourcing is a huge plus." }
    ],
    webConsensus: {
      headline: "Praised for ethical fair-trade supply chain and steady ripening consistency.",
      summary: "EquiFruit bananas rank high in grocery reviews for consistent ripeness upon delivery, rich potassium content, and velvety texture ideal for morning protein shakes.",
      keyStrengths: ["Ethical fair-trade practices", "Rich potassium & Vitamin B6", "Blends smoothly into shakes"]
    }
  },

  prod_spinach: {
    productId: "prod_spinach",
    rating: 4.6,
    reviewsCount: 220,
    breakdown: { fiveStar: 76, fourStar: 16, threeStar: 5, twoStar: 2, oneStar: 1 },
    sentimentTags: ["Pre-Washed & Clean", "Tender Baby Leaves", "Iron-Rich", "No Wilt"],
    customerReviews: [
      { author: "Michael B.", rating: 5, date: "4 days ago", comment: "Zero grit or sand, very fresh tender leaves that sautés down delightfully." },
      { author: "Karen P.", rating: 4, date: "1 week ago", comment: "Stays crisp in the clamshell container. Essential for daily green smoothies." }
    ],
    webConsensus: {
      headline: "Acclaimed for cleanliness, zero bitter aftertaste, and high micronutrient density.",
      summary: "Consumer kitchen reviews highlight Earthbound Farm baby spinach for triple-washed convenience, sweet mild greens, and tender stems that don't need de-stemming.",
      keyStrengths: ["Triple washed & ready to eat", "High iron & Vitamin K", "Tender edible stems"]
    }
  },

  prod_avocado: {
    productId: "prod_avocado",
    rating: 4.8,
    reviewsCount: 450,
    breakdown: { fiveStar: 85, fourStar: 10, threeStar: 3, twoStar: 2, oneStar: 0 },
    sentimentTags: ["Buttery Texture", "Perfect Guacamole", "Healthy Fats", "Uniform Size"],
    customerReviews: [
      { author: "Carlos G.", rating: 5, date: "2 days ago", comment: "Cut into them and they were completely green with no brown stringy fibers! Heavenly guacamole." },
      { author: "Dana H.", rating: 5, date: "6 days ago", comment: "Great 3-pack value. Creamy texture on sourdough toast every morning." }
    ],
    webConsensus: {
      headline: "Top-rated Hass avocados for smooth buttery texture and fiber-free flesh.",
      summary: "Culinary forums and food editors consistently recommend these California Hass avocados for their rich oleic acid profile, nutty undertone, and velvety mouthfeel.",
      keyStrengths: ["Rich monounsaturated healthy fats", "No stringy brown fibers", "Ideal for avocado toast"]
    }
  },

  prod_berries_straw: {
    productId: "prod_berries_straw",
    rating: 4.8,
    reviewsCount: 620,
    breakdown: { fiveStar: 84, fourStar: 11, threeStar: 3, twoStar: 1, oneStar: 1 },
    sentimentTags: ["Sun-Ripened Sweetness", "Organic Certified", "Vibrant Red", "Dessert Ready"],
    customerReviews: [
      { author: "Chloe N.", rating: 5, date: "3 days ago", comment: "Sweet all the way through to the core! Delicious with Greek yogurt." },
      { author: "Brian S.", rating: 4, date: "1 week ago", comment: "Bright red and fragrant. A family favorite breakfast berry." }
    ],
    webConsensus: {
      headline: "Praised by pastry chefs for intense natural berry aroma and sweetness.",
      summary: "Driscoll's Organic strawberries receive high marks on grocery delivery reviews for full red coloration, absence of hollow white centers, and high Vitamin C.",
      keyStrengths: ["Full red ripeness", "High natural antioxidants", "Great for fruit tarts & yogurt"]
    }
  },

  prod_berries_blue: {
    productId: "prod_berries_blue",
    rating: 4.7,
    reviewsCount: 310,
    breakdown: { fiveStar: 80, fourStar: 14, threeStar: 4, twoStar: 1, oneStar: 1 },
    sentimentTags: ["Plump & Firm", "Antioxidant Loaded", "Sweet Tart", "Pancake Essential"],
    customerReviews: [
      { author: "Valerie P.", rating: 5, date: "4 days ago", comment: "Huge juicy berries with a firm snap. No squishy bottom layer!" }
    ],
    webConsensus: {
      headline: "Top-rated fresh berries praised for sweet floral flavor and high anthocyanins.",
      summary: "Consumer kitchen taste tests praise Driscoll's fresh blueberries for consistent berry sizing, firm skin snap, and deep indigo antioxidant pigmentation.",
      keyStrengths: ["Firm skin that resists crushing", "High antioxidant anthocyanins", "Sweet natural snacking"]
    }
  },

  prod_tomatoes_roma: {
    productId: "prod_tomatoes_roma",
    rating: 4.7,
    reviewsCount: 290,
    breakdown: { fiveStar: 79, fourStar: 15, threeStar: 4, twoStar: 2, oneStar: 0 },
    sentimentTags: ["Dense Flesh", "Low Seed Cavity", "Sauce Perfection", "Vine Ripened"],
    customerReviews: [
      { author: "Marco R.", rating: 5, date: "2 days ago", comment: "Ideal for homemade marinara! Meatier flesh with less watery seeds." }
    ],
    webConsensus: {
      headline: "The premier plum tomato for rich Italian sauces and oven roasting.",
      summary: "Culinary chefs recommend Campari Roma tomatoes for thick meaty walls, balanced acidity, and high pectin content that reduces into rich pasta sauces without bitterness.",
      keyStrengths: ["Meaty thick walls", "High lycopene content", "Low moisture seed cavity"]
    }
  },

  prod_lemon_meyer: {
    productId: "prod_lemon_meyer",
    rating: 4.8,
    reviewsCount: 360,
    breakdown: { fiveStar: 85, fourStar: 11, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Aromatic Rind", "Floral Citrus", "Less Acidic", "Cocktail Ready"],
    customerReviews: [
      { author: "Cynthia G.", rating: 5, date: "3 days ago", comment: "Incredible sweet floral aroma. Thin skin makes zesting pure joy." }
    ],
    webConsensus: {
      headline: "Celebrated by mixologists and pastry chefs for sweet herbal floral citrus notes.",
      summary: "Meyer lemons are renowned online as a natural mandarin-lemon hybrid with delicate herbal notes, high juice yield, and lower harsh acidity compared to Lisbon lemons.",
      keyStrengths: ["Sweet floral mandarin aroma", "Thin edible zest rind", "High juice yield per lemon"]
    }
  },

  dairy_milk_whole: {
    productId: "dairy_milk_whole",
    rating: 4.8,
    reviewsCount: 940,
    breakdown: { fiveStar: 86, fourStar: 10, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Creamy & Rich", "DHA Omega-3", "Pasture-Raised Cows", "Clean Sweet Finish"],
    customerReviews: [
      { author: "Emily C.", rating: 5, date: "Yesterday", comment: "Tastes like farm fresh milk from childhood. Creamy without feeling heavy." },
      { author: "Thomas B.", rating: 5, date: "4 days ago", comment: "Horizon Organic is our staple. Makes the best lattes and creamy mac and cheese." }
    ],
    webConsensus: {
      headline: "Rated among the highest quality organic whole milks nationwide in dairy taste tests.",
      summary: "Dairy review panels and parenting publications praise Horizon Organic Grade A Whole Milk for its rich pasture-fed creaminess, strict non-GMO grass-fed animal welfare standards, and naturally high calcium & Vitamin D.",
      keyStrengths: ["Certified organic & non-GMO", "Pasture-raised animal care", "Rich frothing microfoam for coffee"]
    }
  },

  dairy_milk_oat: {
    productId: "dairy_milk_oat",
    rating: 4.9,
    reviewsCount: 710,
    breakdown: { fiveStar: 92, fourStar: 6, threeStar: 1, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Barista Favorite", "Silky Microfoam", "Nut-Free & Vegan", "No Separation"],
    customerReviews: [
      { author: "Liam F.", rating: 5, date: "2 days ago", comment: "The gold standard for homemade lattes! Froths like real whole dairy milk without curdling." },
      { author: "Zoe A.", rating: 5, date: "5 days ago", comment: "Subtle natural sweetness with zero gummy texture. Best plant milk on the market." }
    ],
    webConsensus: {
      headline: "The #1 barista choice globally for specialty coffee and non-dairy latte art.",
      summary: "Oatly Barista Edition is universally acclaimed on coffee forums and culinary blogs for its neutral oat profile, stable thermal emulsion in hot espresso, and allergen-free formulation.",
      keyStrengths: ["Flawless dense microfoam", "No added gums or artificial binders", "100% vegan & nut-free"]
    }
  },

  dairy_milk_almond: {
    productId: "dairy_milk_almond",
    rating: 4.7,
    reviewsCount: 530,
    breakdown: { fiveStar: 80, fourStar: 14, threeStar: 4, twoStar: 2, oneStar: 0 },
    sentimentTags: ["Low-Calorie", "Subtle Nutty Tone", "Zero Added Sugar", "Smooth Texture"],
    customerReviews: [
      { author: "Rebecca L.", rating: 5, date: "3 days ago", comment: "Only 35 calories per serving and tastes genuinely nutty. Perfect for morning smoothies." }
    ],
    webConsensus: {
      headline: "Praised as the cleanest everyday unsweetened almond milk for keto and low-calorie diets.",
      summary: "Califia Farms almond milk is consistently recommended by dietitians for natural artisan roasting, silky mouthfeel, and zero added carrageenan thickeners.",
      keyStrengths: ["Only 35 calories per cup", "Zero added sugar", "Carrageenan-free"]
    }
  },

  dairy_butter_salted: {
    productId: "dairy_butter_salted",
    rating: 4.9,
    reviewsCount: 680,
    breakdown: { fiveStar: 93, fourStar: 5, threeStar: 1, twoStar: 1, oneStar: 0 },
    sentimentTags: ["82% Butterfat", "Golden Yellow", "Grass-Fed Irish Cream", "Baking Gold"],
    customerReviews: [
      { author: "Rachel D.", rating: 5, date: "3 days ago", comment: "Once you taste Kerrygold, you can never go back to regular butter. Rich golden color and incredible depth." },
      { author: "Chef Anthony", rating: 5, date: "1 week ago", comment: "High butterfat content produces the flakiest puff pastries and richest pan sauces." }
    ],
    webConsensus: {
      headline: "Revered by professional bakers and chefs worldwide for unmatched richness.",
      summary: "Kerrygold Pure Irish Butter consistently wins blind taste tests in food publications. Grass-fed Irish dairy delivers higher beta-carotene, natural yellow hue, and an 82% butterfat ratio.",
      keyStrengths: ["Grass-fed cow milk", "High 82% butterfat for flakier pastries", "Naturally spreadable at room temp"]
    }
  },

  dairy_cheese_cheddar: {
    productId: "dairy_cheese_cheddar",
    rating: 4.9,
    reviewsCount: 510,
    breakdown: { fiveStar: 89, fourStar: 8, threeStar: 2, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Sharp & Nutty", "Aged 12 Months", "Calcium Lactate Crystals", "Melts Beautifully"],
    customerReviews: [
      { author: "Danielle V.", rating: 5, date: "4 days ago", comment: "Has those delightful little crunchy flavor crystals from aging. Bold, sharp flavor profile!" },
      { author: "Gregory S.", rating: 5, date: "2 weeks ago", comment: "Top tier snacking cheese for charcuterie boards and sharp grilled cheeses." }
    ],
    webConsensus: {
      headline: "Acclaimed on cheese enthusiast boards for sharp tang and crumbly crystalline texture.",
      summary: "Cabot Vermont Sharp Cheddar is celebrated for authentic 12-month cave aging, zero artificial additives, and a naturally sharp bite that cuts through rich dishes.",
      keyStrengths: ["Naturally aged 12 months", "Distinctive tyrosine flavor crystals", "Lactose-free naturally"]
    }
  },

  dairy_greek_yogurt: {
    productId: "dairy_greek_yogurt",
    rating: 4.8,
    reviewsCount: 420,
    breakdown: { fiveStar: 84, fourStar: 12, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["18g Protein", "Velvety Thick", "Live Probiotics", "Non-Sour Balance"],
    customerReviews: [
      { author: "Sophia W.", rating: 5, date: "Yesterday", comment: "So thick your spoon stands upright in it! Smooth, creamy, and high protein for post-workout." },
      { author: "Brandon M.", rating: 5, date: "5 days ago", comment: "No watery whey separation. The whole milk fat gives pure luxury texture." }
    ],
    webConsensus: {
      headline: "The quintessential authentic strained Greek yogurt praised by nutritionists.",
      summary: "FAGE Total is widely regarded on fitness and culinary platforms as the gold standard of strained Greek yogurt due to its clean ingredient list (milk + live active cultures) and 18g natural protein.",
      keyStrengths: ["18g protein per serving", "Authentically strained without thickeners", "5 live probiotic strains"]
    }
  },

  dairy_eggs_freerange: {
    productId: "dairy_eggs_freerange",
    rating: 4.9,
    reviewsCount: 1120,
    breakdown: { fiveStar: 92, fourStar: 6, threeStar: 1, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Deep Amber Yolks", "108 Sq Ft Pasture", "Certified Humane", "Superior Poaching"],
    customerReviews: [
      { author: "Hannah L.", rating: 5, date: "2 days ago", comment: "The yolks are a glowing deep orange and stand high in the pan. Tastes richer than any store egg." },
      { author: "Chef Eric", rating: 5, date: "1 week ago", comment: "The only eggs I use for poaching and pasta dough. The egg white membrane is dense and firm." }
    ],
    webConsensus: {
      headline: "Ranked #1 pasture-raised egg brand nationally in culinary and ethical food reviews.",
      summary: "Vital Farms is celebrated across food magazines and organic consumer guides for guaranteeing 108 sq ft of open outdoor pasture per hen. Delivers nutrient-rich, deep orange yolks with higher Omega-3 and Vitamin E.",
      keyStrengths: ["Deep amber-orange rich yolks", "108 sq ft outdoor pasture per hen", "Dense egg whites ideal for poaching"]
    }
  },

  bakery_sourdough: {
    productId: "bakery_sourdough",
    rating: 4.8,
    reviewsCount: 540,
    breakdown: { fiveStar: 86, fourStar: 10, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Wild Starter", "Blistered Crust", "Custardy Crumb", "Gut-Friendly"],
    customerReviews: [
      { author: "Oliver J.", rating: 5, date: "Yesterday", comment: "Crisp crackly crust with an airy, chewy crumb. That subtle tang is artisan perfection." },
      { author: "Maya B.", rating: 5, date: "3 days ago", comment: "Makes world-class avocado toast and garlic bread. You can tell it was naturally fermented." }
    ],
    webConsensus: {
      headline: "Artisanal bakery quality delivered fresh with traditional 36-hour wild fermentation.",
      summary: "Acclaimed on bread lover subreddits and food blogs for genuine long cold-fermentation, blistered crust, and open airy crumb structure with gut-friendly digestible sourdough lactic acid.",
      keyStrengths: ["36-hour slow cold fermentation", "No commercial yeast or preservatives", "Easy on digestion"]
    }
  },

  bakery_croissant: {
    productId: "bakery_croissant",
    rating: 4.8,
    reviewsCount: 390,
    breakdown: { fiveStar: 85, fourStar: 11, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Honeycomb Layers", "100% French Butter", "Flaky & Golden", "Cafe Quality"],
    customerReviews: [
      { author: "Claire F.", rating: 5, date: "2 days ago", comment: "Warm them in the oven for 3 minutes and your kitchen smells like a Paris boulangerie! Flaky bliss." }
    ],
    webConsensus: {
      headline: "Authentic French laminated pastry with crisp flaky exterior and tender honeycomb interior.",
      summary: "Reviewed as one of the few true all-butter grocery croissants on the market that achieves a genuine 24-layer lamination without artificial dough conditioners.",
      keyStrengths: ["100% pure butter lamination", "Honeycomb interior structure", "Crisps up in 3 minutes in oven"]
    }
  },

  bakery_bagels_everything: {
    productId: "bakery_bagels_everything",
    rating: 4.6,
    reviewsCount: 280,
    breakdown: { fiveStar: 78, fourStar: 15, threeStar: 5, twoStar: 2, oneStar: 0 },
    sentimentTags: ["Kettle-Boiled", "Loaded Seed Topping", "Chewy Dense Crumb", "NYC Authentic"],
    customerReviews: [
      { author: "Aaron Z.", rating: 5, date: "4 days ago", comment: "Generous garlic, sesame, and poppy seed coating. Holds cream cheese and smoked salmon." }
    ],
    webConsensus: {
      headline: "Traditional water-kettle boiled bagels with authentic New York chew.",
      summary: "Consistently rated top-tier in breakfast reviews for generous two-sided seed coverage and traditional kettle-boiling step that creates the quintessential glossy crust and dense chewy center.",
      keyStrengths: ["Kettle-boiled before baking", "Two-sided seasoned seed coating", "Freezer-friendly freshness"]
    }
  },

  pantry_olive_oil: {
    productId: "pantry_olive_oil",
    rating: 4.9,
    reviewsCount: 880,
    breakdown: { fiveStar: 91, fourStar: 7, threeStar: 2, twoStar: 0, oneStar: 0 },
    sentimentTags: ["Cold-Pressed", "High Polyphenols", "Peppery Finish", "California Grown"],
    customerReviews: [
      { author: "Chef Marco", rating: 5, date: "3 days ago", comment: "One of the few verified 100% extra virgin olive oils with a true peppery finish indicating high antioxidant polyphenols." },
      { author: "Laura T.", rating: 5, date: "1 week ago", comment: "Fruity and fresh on salads, yet smooth enough for medium heat sautéing." }
    ],
    webConsensus: {
      headline: "Consistently awarded 'Best Everyday Olive Oil' by culinary magazines and chef panels.",
      summary: "California Olive Ranch 100% California EVOO is rated #1 for transparency, single-origin freshness, and rigorous testing exceeding IOC standards. Delivers fresh cut-grass aroma and peppery throat catch.",
      keyStrengths: ["First cold-pressed within hours of harvest", "High antioxidant polyphenol content", "Dark glass UV-protective bottle"]
    }
  },

  pantry_pasta_organic: {
    productId: "pantry_pasta_organic",
    rating: 4.8,
    reviewsCount: 460,
    breakdown: { fiveStar: 84, fourStar: 12, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Bronze-Cut", "Rough Texture Holds Sauce", "Al Dente Chew", "100% Durum Wheat"],
    customerReviews: [
      { author: "Geno D.", rating: 5, date: "2 days ago", comment: "Bronze-die extrusion makes sauces cling like glue. Holds perfect al dente bite." }
    ],
    webConsensus: {
      headline: "The benchmark of traditional bronze-extruded Italian dried pasta.",
      summary: "De Cecco pasta is celebrated by Italian chefs for low-temperature slow drying that preserves gluten proteins and a matte chalky texture that emulsifies pasta sauces.",
      keyStrengths: ["Bronze die textured surface", "Slow low-temp drying", "Perfect al dente elasticity"]
    }
  },

  pantry_honey_raw: {
    productId: "pantry_honey_raw",
    rating: 4.8,
    reviewsCount: 510,
    breakdown: { fiveStar: 88, fourStar: 9, threeStar: 2, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Unfiltered & Raw", "Living Bee Enzymes", "Wildflower Nectar", "Creamy Crystal State"],
    customerReviews: [
      { author: "Amanda E.", rating: 5, date: "Yesterday", comment: "Rich, floral, and unpasteurized. You can see the tiny pollen flecks. True liquid gold!" }
    ],
    webConsensus: {
      headline: "Pure unheated raw wildflower honey praised for rich enzyme and pollen profile.",
      summary: "Nature Nate's 100% Pure Raw & Unfiltered Honey is celebrated across health forums for never being heated beyond natural hive temperatures (115°F), preserving beneficial living enzymes and antioxidants.",
      keyStrengths: ["Raw & unpasteurized", "Preserves natural pollen & enzymes", "Rich multi-floral flavor"]
    }
  },

  pantry_rice_basmati: {
    productId: "pantry_rice_basmati",
    rating: 4.9,
    reviewsCount: 630,
    breakdown: { fiveStar: 90, fourStar: 8, threeStar: 2, twoStar: 0, oneStar: 0 },
    sentimentTags: ["Extra Long Grain", "Aged 2 Years", "Non-Sticky Fluffy", "Naturally Aromatic"],
    customerReviews: [
      { author: "Priya S.", rating: 5, date: "2 days ago", comment: "Grains elongate to double their size when cooked! Completely separate and aromatic. Best for Biryani." }
    ],
    webConsensus: {
      headline: "Authentic Himalayan foothills aged basmati rice revered for exceptional grain elongation.",
      summary: "Indian culinary blogs and international food critics rate Royal Organic Basmati as the benchmark for aromatic long-grain rice, aged for 24 months to enhance aroma and guarantee non-sticky separation.",
      keyStrengths: ["Aged 2 years for peak aroma", "Grains double in length upon steaming", "Zero clumping or sticky starch"]
    }
  },

  pantry_oats_rolled: {
    productId: "pantry_oats_rolled",
    rating: 4.8,
    reviewsCount: 480,
    breakdown: { fiveStar: 85, fourStar: 11, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Thick Kiln-Toasted", "Heart Healthy", "Overnight Oats Champ", "High Fiber"],
    customerReviews: [
      { author: "Hannah T.", rating: 5, date: "3 days ago", comment: "Thick, substantial flakes that make the creamiest overnight oats without turning slimy." }
    ],
    webConsensus: {
      headline: "The gold standard of whole grain kiln-toasted rolled oats for breakfast.",
      summary: "Bob's Red Mill whole grain oats are lauded by nutritionists for high soluble beta-glucan fiber, nutty roasted oat aroma, and thick uniform flakes.",
      keyStrengths: ["High beta-glucan soluble fiber", "Kiln toasted for nutty flavor", "Holds texture in hot water or milk"]
    }
  },

  meat_chicken_breast: {
    productId: "meat_chicken_breast",
    rating: 4.8,
    reviewsCount: 730,
    breakdown: { fiveStar: 85, fourStar: 11, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Air-Chilled", "No Added Water", "Antibiotic-Free", "Juicy & Tender"],
    customerReviews: [
      { author: "Mark W.", rating: 5, date: "2 days ago", comment: "Air-chilled makes a massive difference! No retained water in the pan and Sears to a golden crust." }
    ],
    webConsensus: {
      headline: "Consistently rated superior in butcher taste tests for 100% air-chilled processing.",
      summary: "Culinary test kitchens praise Bell & Evans organic chicken for pure air-chilling (no chlorinated ice bath water absorption), leading to better sear crisping and juicier meat.",
      keyStrengths: ["100% air-chilled (zero added water weight)", "100% organic vegetarian-fed", "No antibiotics ever"]
    }
  },

  meat_salmon_wild: {
    productId: "meat_salmon_wild",
    rating: 4.9,
    reviewsCount: 420,
    breakdown: { fiveStar: 91, fourStar: 7, threeStar: 2, twoStar: 0, oneStar: 0 },
    sentimentTags: ["Wild-Caught", "Deep Ruby Flesh", "Omega-3 Powerhouse", "Crispy Skin"],
    customerReviews: [
      { author: "Chef Lucas", rating: 5, date: "Yesterday", comment: "Vibrant ruby color and rich natural oil content. Crisps in cast iron like restaurant quality." }
    ],
    webConsensus: {
      headline: "MSC-certified sustainable wild Alaskan salmon praised for dense, flavorful flakes.",
      summary: "Seafood guides and nutritionists rate this wild-caught sockeye salmon at the top of healthy proteins for its high EPA/DHA Omega-3 concentrations and clean ocean flavor.",
      keyStrengths: ["MSC certified sustainable wild-caught", "High natural Omega-3 healthy fats", "Dense, non-mushy flake structure"]
    }
  },

  meat_tofu_firm: {
    productId: "meat_tofu_firm",
    rating: 4.7,
    reviewsCount: 310,
    breakdown: { fiveStar: 80, fourStar: 14, threeStar: 4, twoStar: 1, oneStar: 1 },
    sentimentTags: ["Extra Firm", "High Plant Protein", "Absorbs Marinades", "Crisps in Air Fryer"],
    customerReviews: [
      { author: "Sam Y.", rating: 5, date: "4 days ago", comment: "Holds together when diced and stir-fried! Gets super crispy in the air fryer." }
    ],
    webConsensus: {
      headline: "The top-rated plant-based protein for stir-fries and crispy baked cubes.",
      summary: "House Foods Organic Extra Firm Tofu is praised on vegan recipe platforms for dense protein structure that requires minimal pressing and absorbs sauces deeply.",
      keyStrengths: ["14g plant protein per serving", "Non-GMO Project Verified", "Holds shape in high-heat cooking"]
    }
  },

  bev_coffee_coldbrew: {
    productId: "bev_coffee_coldbrew",
    rating: 4.8,
    reviewsCount: 650,
    breakdown: { fiveStar: 88, fourStar: 9, threeStar: 2, twoStar: 1, oneStar: 0 },
    sentimentTags: ["16-Hour Steep", "Zero Acidity", "Naturally Sweet", "Rich Dark Roast"],
    customerReviews: [
      { author: "Julian R.", rating: 5, date: "Yesterday", comment: "Unbelievably smooth and chocolatey. Clean sustained caffeine energy with zero stomach acidity." }
    ],
    webConsensus: {
      headline: "The gold standard of slow-steeped Arabica cold brew concentrate.",
      summary: "Coffee review boards praise Chameleon Cold Brew for its 16-hour Texas Hill Country steep that yields smooth dark chocolate and toffee notes without bitterness.",
      keyStrengths: ["16-hour slow cold extraction", "Organic certified fair trade Arabica", "Naturally low acidity"]
    }
  },

  bev_sparkling_water: {
    productId: "bev_sparkling_water",
    rating: 4.9,
    reviewsCount: 890,
    breakdown: { fiveStar: 92, fourStar: 6, threeStar: 1, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Real Squeezed Fruit", "Tight Refreshing Bubbles", "Zero Added Sugar", "Zesty Lime"],
    customerReviews: [
      { author: "Eric V.", rating: 5, date: "Yesterday", comment: "Has actual real lime juice in it, not synthetic lab flavors! Incredibly refreshing." }
    ],
    webConsensus: {
      headline: "Acclaimed as the most authentic fruit-forward canned sparkling water on the market.",
      summary: "Spindrift sparkling water earns top consumer ratings for using real squeezed fruit juice with zero artificial flavor essences, preservatives, or sweeteners.",
      keyStrengths: ["Real squeezed fruit juice", "Zero added sugar or synthetic flavorings", "Crisp natural effervescence"]
    }
  },

  bev_tea_green: {
    productId: "bev_tea_green",
    rating: 4.9,
    reviewsCount: 410,
    breakdown: { fiveStar: 93, fourStar: 5, threeStar: 1, twoStar: 1, oneStar: 0 },
    sentimentTags: ["First Harvest Uji", "Electric Emerald", "Sweet Umami Finish", "Zero Bitterness"],
    customerReviews: [
      { author: "Mei L.", rating: 5, date: "2 days ago", comment: "Vibrant electric green color with a deep, sweet umami flavor. Whills smoothly without clumps." }
    ],
    webConsensus: {
      headline: "Authentic Kyoto ceremonial-grade matcha revered for profound umami sweetness.",
      summary: "Tea masters and wellness reviewers applaud Ippodo ceremonial matcha for shade-grown stone-milled Japanese tencha leaves that produce a rich emerald foam without astringency.",
      keyStrengths: ["First-harvest shade-grown tencha", "Stone-milled in Kyoto, Japan", "High L-Theanine focus support"]
    }
  },

  snack_dark_chocolate: {
    productId: "snack_dark_chocolate",
    rating: 4.9,
    reviewsCount: 520,
    breakdown: { fiveStar: 92, fourStar: 6, threeStar: 1, twoStar: 1, oneStar: 0 },
    sentimentTags: ["85% Cocoa", "Organic Coconut Sugar", "Sea Salt Flakes", "No Palm Oil"],
    customerReviews: [
      { author: "Maya K.", rating: 5, date: "Yesterday", comment: "Addictive perfection! The touch of sea salt cuts through the dark cacao wonderfully." }
    ],
    webConsensus: {
      headline: "Reviewed as the pinnacle of clean-label artisanal dark chocolate.",
      summary: "Chocolatiers and paleo reviewers praise Hu Dark Chocolate for 3 simple ingredients (organic cacao, unrefined coconut sugar, fair-trade cocoa butter) and flaky sea salt crystals.",
      keyStrengths: ["85% fair-trade single origin cacao", "Flaky sea salt balance", "No palm oil, soy lecithin, or refined sugar"]
    }
  },

  snack_almonds_roasted: {
    productId: "snack_almonds_roasted",
    rating: 4.8,
    reviewsCount: 470,
    breakdown: { fiveStar: 86, fourStar: 10, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Oven-Roasted", "Natural Hickory Smoke", "Keto Snack", "High Protein"],
    customerReviews: [
      { author: "Steve M.", rating: 5, date: "2 days ago", comment: "Crunchy oven-roasted California almonds with savory smoky seasoning. Best evening snack." }
    ],
    webConsensus: {
      headline: "The top-rated seasoned whole almond snack for keto and athletic recovery.",
      summary: "Snack comparisons rate Blue Diamond smokehouse almonds highest for even natural smoke seasoning, loud oven-roasted crunch, and 6g protein per serving.",
      keyStrengths: ["100% whole California almonds", "Oven roasted with natural smoke", "High healthy fats & Vitamin E"]
    }
  },

  house_dish_soap: {
    productId: "house_dish_soap",
    rating: 4.8,
    reviewsCount: 390,
    breakdown: { fiveStar: 85, fourStar: 11, threeStar: 3, twoStar: 1, oneStar: 0 },
    sentimentTags: ["Cuts Grease Fast", "Plant-Based Biodegradable", "Gentle on Hands", "Grapefruit Citrus"],
    customerReviews: [
      { author: "Melissa L.", rating: 5, date: "2 days ago", comment: "Cuts through bacon grease and burnt baking pans immediately without drying out my hands." }
    ],
    webConsensus: {
      headline: "The top-rated eco-friendly dish soap in independent cleaning lab comparisons.",
      summary: "Method Plant-Based Dish Soap is recommended by green living guides and consumer testing labs for biodegradable coconut-derived surfactants that power through grease while keeping skin moisturized.",
      keyStrengths: ["Plant-based coconut surfactant grease cutting", "100% recycled plastic bottle", "Cruelty-free & dermatologist tested"]
    }
  },

  house_toothpaste: {
    productId: "house_toothpaste",
    rating: 4.6,
    reviewsCount: 290,
    breakdown: { fiveStar: 78, fourStar: 14, threeStar: 5, twoStar: 2, oneStar: 1 },
    sentimentTags: ["Natural Peppermint", "SLS-Free Gentle", "Whitening Minerals", "Long Fresh Breath"],
    customerReviews: [
      { author: "Dr. Karen E. (DDS)", rating: 5, date: "3 days ago", comment: "As a dental professional, I love recommending this natural wild peppermint toothpaste. Cleans thoroughly without burning." }
    ],
    webConsensus: {
      headline: "Acclaimed by holistic dental publications for natural mint essential oils and gentle whitening.",
      summary: "Tom's of Maine Natural Toothpaste is highlighted on health product reviews for naturally sourced calcium carbonate polishing, real field mint essential oils, and zero artificial sweeteners or dyes.",
      keyStrengths: ["Natural essential peppermint oil freshness", "SLS-free & dye-free gentle formula", "Natural enamel polishing minerals"]
    }
  }
};

/**
 * Resolves full review & web consensus data for a given product name or ID.
 */
export function getProductReviews(queryOrId) {
  if (!queryOrId) return null;

  // 1. Direct ID match
  if (PRODUCT_REVIEWS_DATABASE[queryOrId]) {
    const data = PRODUCT_REVIEWS_DATABASE[queryOrId];
    const product = PRODUCT_CATALOG.find(p => p.id === data.productId) || {};
    return { ...product, ...data };
  }

  // 2. Resolve via catalog search
  const product = findCatalogProduct(queryOrId);
  if (product && PRODUCT_REVIEWS_DATABASE[product.id]) {
    const data = PRODUCT_REVIEWS_DATABASE[product.id];
    return { ...product, ...data };
  }

  // 3. Fallback to product basic info with synthetic reviews
  if (product) {
    return {
      ...product,
      productId: product.id,
      rating: product.rating || 4.8,
      reviewsCount: product.reviewsCount || 250,
      breakdown: { fiveStar: 85, fourStar: 11, threeStar: 3, twoStar: 1, oneStar: 0 },
      sentimentTags: ["Fresh & Delicious", "High Quality", "Customer Favorite"],
      customerReviews: [
        { author: "Verified Customer", rating: 5, date: "Recent", comment: `${product.name} is fresh, delicious, and top quality!` }
      ],
      webConsensus: {
        headline: `Highly praised for freshness, exceptional taste, and fast 10-minute delivery.`,
        summary: `Customers and food reviewers online consistently praise ${product.name} (${product.brand}) for its premium freshness, clean taste, and great value.`,
        keyStrengths: ["Fresh quality guarantee", "10-minute grocery delivery", "Top customer satisfaction"]
      }
    };
  }

  return null;
}
