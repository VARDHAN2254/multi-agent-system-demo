import time
import uuid
from typing import Tuple
from backend.models.state import ArticleData

# PRNG setup for deterministic runs without API keys
def seeded_random(seed: int, salt: int):
    val = seed + salt
    val = (val ^ 61) ^ (val >> 16)
    val = val + (val << 3)
    val = val ^ (val >> 4)
    val = val * 0x27d4eb2d
    val = val ^ (val >> 15)
    return (val & 0xFFFFFFFF) / 0xFFFFFFFF

class FetcherAgent:
    def process(self, article_id: str, seed: int) -> ArticleData:
        time.sleep(0.5) # Simulate network
        dummy_articles = {
            "1": ("Advances in Quantum Computing", "Quantum computing is rapidly evolving. Recent breakthroughs in error correction have allowed for longer coherence times, making practical quantum applications closer to reality. Researchers at major labs have successfully demonstrated a logical qubit..."),
            "2": ("Global Market Trends 2026", "The global market has seen a massive shift towards renewable energy investments. Traditional oil stocks are stabilizing while solar and wind energy sectors see a 15% year-over-year growth due to new government subsidies and better battery tech..."),
            "3": ("The Future of AI Regulatory Frameworks", "Governments worldwide are beginning to draft comprehensive regulations regarding Artificial Intelligence. The European Union has taken the lead with the AI Act, aiming to classify AI systems by risk..."),
            "4": ("Breakthroughs in Solid-State Batteries", "Electric vehicles are poised for a significant upgrade as solid-state battery technology reaches commercial viability. Toyota and other manufacturers announce plans to implement these batteries by 2027..."),
            "5": ("Mars Colonization Plans Delayed", "SpaceX and NASA have jointly announced a slight delay in the Artemis and subsequent Mars missions. Technical challenges relating to long-term life support systems and radiation shielding have forced engineers back to the drawing board..."),
            "6": ("Cryptocurrency Market Stabilizes", "After months of volatility, the crypto market is showing signs of stabilization. The recent string of ETF approvals by the SEC has brought institutional investors into the fold, reducing the wild swings..."),
            "7": ("New Discoveries in Deep Sea Habitats", "Oceanographers exploring the Mariana Trench have discovered three previously unknown species of bio-luminescent fish. These organisms thrive in extreme pressure and darkness, offering new insights..."),
            "8": ("Urban Farming Initiatives Gain Momentum", "Vertical farming and rooftop gardens are transforming city landscapes. Tech startups are using hydroponics and AI-controlled climates to produce leafy greens and vegetables directly within metropolis centers..."),
            "9": ("Advancements in Personalized Medicine", "Genomic sequencing has become affordable enough to be integrated into standard healthcare. Personalized medicine is showing remarkable success rates in oncology, reducing side effects of traditional chemo..."),
            "10": ("Global Supply Chain Resilience Improvements", "Following recent disruptions, global supply chains have been fundamentally restructured. Companies are moving away from just-in-time manufacturing towards localized hubs and redundant supplier networks...")
        }
        title, text = dummy_articles.get(article_id, ("Mock Article", "Mock text body for testing purposes with enough length to be summarized later."))
        return ArticleData(article_id=article_id, title=title, raw_text=text, source="TechDaily", timestamp=None)

class AnalyzerAgent:
    def process(self, article: ArticleData, seed: int) -> ArticleData:
        time.sleep(0.8) # Simulate NLP Processing
        r = seeded_random(seed, int(article.article_id))
        
        # Mock NLP logic
        if "Quantum" in article.title:
            article.category = "Technology"
            article.sentiment = 0.8
            article.key_entities = ["Quantum computing", "qubit", "error correction"]
        elif "Market" in article.title:
            article.category = "Finance"
            article.sentiment = 0.6
            article.key_entities = ["renewable energy", "solar", "wind", "stocks"]
        else:
            article.category = "General"
            article.sentiment = 0.5
            article.key_entities = ["Mock Entity"]
            
        article.complexity_score = 0.5 + (r * 0.4) # 0.5 to 0.9
        return article

class SummarizerAgent:
    def process(self, article: ArticleData, seed: int, attempt: int) -> ArticleData:
        time.sleep(1.2) # Simulate LLM generation
        r = seeded_random(seed, attempt * 10)
        
        article.summary_headline = f"Summary: {article.title}"
        article.summary_abstract = f"This article discusses {article.category.lower()} topics, specifically focusing on {', '.join(article.key_entities)}. It holds a sentiment score of {article.sentiment}."
        
        # If it's a retry, we generate slightly more detailed bullets to pass evaluation
        extra_bullet = "Additional context provided on retry." if attempt > 1 else ""
        
        article.summary_bullets = [
            f"Key entity identified: {article.key_entities[0]}",
            f"Assessed as having a complexity score of {article.complexity_score:.2f}.",
            f"Categorized under {article.category}.",
            extra_bullet
        ]
        
        # Filter out empty bullets
        article.summary_bullets = [b for b in article.summary_bullets if b]
        return article

class EvaluatorAgent:
    def process(self, article: ArticleData, seed: int, attempt: int) -> Tuple[bool, float, float, float]:
        time.sleep(0.6)
        r = seeded_random(seed, attempt * 100)
        
        comp_ratio = len(article.summary_abstract + " ".join(article.summary_bullets)) / max(len(article.raw_text), 1)
        relevance = 0.7 + (r * 0.3) if attempt > 1 else 0.5 + (r * 0.3)
        coherence = 4.0 if attempt > 1 else 3.0 + (r * 1.5)
        
        pass_eval = (comp_ratio < 0.6) and (relevance > 0.6) and (coherence >= 3.5)
        
        # Save metrics back to article
        article.metrics = {
            "compression_ratio": comp_ratio,
            "relevance_score": relevance,
            "coherence_score": coherence,
            "pass_rate": 1.0 if pass_eval else 0.0
        }
        return pass_eval, comp_ratio, relevance, coherence
