
import { GoogleGenAI } from "@google/genai";
import { AnalysisResult } from '../types';

// Using 'any' temporarily to accept the new structure shape without breaking interface strictness immediately
export const analyzeStructure = async (params: any, results: AnalysisResult, apiKey: string): Promise<string> => {
  if (!apiKey) {
    return "⚠️ 请先设置 Gemini API Key";
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-2.5-flash';
  
  const maxMoment = results.elements.reduce((max, el) => Math.max(max, el.maxMoment), 0);
  const maxShear = results.elements.reduce((max, el) => Math.max(max, el.maxShear), 0);

  const prompt = `
    你是一位资深的结构工程师。请根据以下的2D刚架/结构参数和有限元分析结果进行点评。
    
    结构类型: 2D 平面结构
    最大弯矩: ${maxMoment.toFixed(2)} kNm
    最大剪力: ${maxShear.toFixed(2)} kN
    最大变形: ${results.maxDeflection.toFixed(2)} mm

    请分析该结构的受力特点（例如刚架的角隅节点受力、柱脚反力等），并评价截面尺寸是否合理。
    
    请使用中文回答，格式清晰，专业且易懂。
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || "无法生成分析结果。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "连接 AI 工程师时出错，请检查网络设置。";
  }
};
