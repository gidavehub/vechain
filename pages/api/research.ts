import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Types for our responses
type SearchResult = {
    title: string;
    url: string;
    snippet: string;
    fullContent?: string;
};

type ResearchResponse = {
    summary: string;
    sources: SearchResult[];
    error?: string;
};

// Utility function to clean HTML content
function cleanText(html: string): string {
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, footer, header, iframe, noscript').remove();
    
    // Get the main content (adjust selectors based on common patterns)
    const mainContent = $('article, main, .content, .post-content').text() || $('body').text();
    
    // Clean up whitespace and normalize text
    return mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();
}

// Fetch and parse webpage content
async function fetchPageContent(url: string): Promise<string> {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        return cleanText(response.data);
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return '';
    }
}

// Google Search API function
async function googleSearch(query: string): Promise<SearchResult[]> {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
    
    if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
        throw new Error('Google API credentials not configured');
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await axios.get(url);
        return response.data.items.map((item: any) => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet
        }));
    } catch (error: any) {
        console.error('Google Search API error:', error.response?.data || error.message);
        throw error;
    }
}

// Main handler
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<ResearchResponse>
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            summary: '',
            sources: [],
            error: 'Method not allowed' 
        });
    }

    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ 
            summary: '',
            sources: [],
            error: 'Query is required' 
        });
    }

    try {
        // 1. Perform Google search
        const searchResults = await googleSearch(query + ' Hedera Hashgraph');
        
        // 2. Fetch content from top 5 results in parallel
        const topResults = searchResults.slice(0, 5);
        const contentPromises = topResults.map(async (result) => {
            const content = await fetchPageContent(result.url);
            return {
                ...result,
                fullContent: content
            };
        });
        
        const resultsWithContent = await Promise.all(contentPromises);

        // 3. Use Gemini to synthesize the information
        const { GoogleGenerativeAI } = await import('@google/generative-ai');

        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Analyze the following articles about "${query}" in the context of Vechain Blockchain and provide:
1. A comprehensive summary
2. Key points of consensus across sources
3. Any notable differences or contradictions
4. Relevant technical details specific to Hedera or Blockchain Technology

Sources to analyze:
${resultsWithContent.map((result, i) => `
Source ${i + 1}: ${result.title}
URL: ${result.url}
Content: ${result.fullContent?.substring(0, 1000)}...
---
`).join('\n')}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        // 4. Return the synthesized response
        return res.status(200).json({
            summary,
            sources: resultsWithContent.map(({ fullContent, ...rest }) => rest) // Exclude full content from response
        });

    } catch (error: any) {
        console.error('Research error:', error);
        return res.status(500).json({
            summary: '',
            sources: [],
            error: error.message
        });
    }
}