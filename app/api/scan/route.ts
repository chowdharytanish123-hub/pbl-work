import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Detection = {
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in before scanning.' }, { status: 401 });
    }

    const body = await request.json() as { image?: string };
    if (!body.image || !body.image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'A captured photo is required.' }, { status: 400 });
    }

    const apiKey = process.env.VISION_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        ingredients: [],
        message: 'Automatic recognition is unavailable. Select the visible ingredients manually.',
        manual: true,
      });
    }

    const apiUrl = process.env.VISION_API_URL || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.VISION_MODEL || 'gpt-4o-mini';
    const prompt = `Analyze this image and identify recognizable food ingredients or groceries. Ignore people, packaging-only objects, and non-food items. Return ONLY valid JSON in this exact shape: {"ingredients":[{"name":"tomato","quantity":1,"unit":"units","confidence":0.95},{"name":"spinach","quantity":200,"unit":"g","confidence":0.85}],"message":""}. Quantity and unit must be estimates. Use units for countable foods and g/kg/ml/litre/bunch/packet only when reasonable. If no food is visible, return {"ingredients":[],"message":"No food ingredients detected. Try scanning vegetables, fruits, groceries, or items inside your fridge."}.`;

    const visionResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: body.image } },
          ],
        }],
      }),
    });

    if (!visionResponse.ok) {
      return NextResponse.json({ error: 'The vision service could not analyze this photo. Please try again.' }, { status: 502 });
    }

    const data = await visionResponse.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'The vision service returned no analysis.' }, { status: 502 });

    let parsed: { ingredients?: Detection[]; message?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start < 0 || end <= start) return NextResponse.json({ error: 'The vision service returned an unreadable result.' }, { status: 502 });
      parsed = JSON.parse(content.slice(start, end + 1));
    }

    const ingredients = (parsed.ingredients ?? [])
      .filter(item => item && typeof item.name === 'string' && item.name.trim())
      .map(item => ({
        name: item.name.trim(),
        quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : 'units',
        confidence: Number.isFinite(Number(item.confidence)) ? Math.min(1, Math.max(0, Number(item.confidence))) : 0,
      }));

    return NextResponse.json({
      ingredients,
      message: ingredients.length ? '' : (parsed.message || 'No food ingredients detected. Try scanning vegetables, fruits, groceries, or items inside your fridge.'),
    });
  } catch {
    return NextResponse.json({ error: 'Analysis could not be completed. Please try again.' }, { status: 500 });
  }
}
