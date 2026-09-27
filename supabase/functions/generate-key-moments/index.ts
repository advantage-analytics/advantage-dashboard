import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    const { match_id } = await req.json();
    console.log(`📌 Generating key moments for match_id: ${match_id}`);

    if (!match_id) {
      throw new Error('match_id is required in the request body');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; 
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: keyMoments, error: rpcError } = await supabase
      .rpc('key_moments', { // Key Moments 2.0 function
        target_match_id: match_id 
      });

    if (rpcError) throw rpcError;

    const keyMomentsJson = (keyMoments || []).reduce((acc: any[], row: any) => {
      let momentObj = null;

      // Get result and format it
      const resultStr = row.out_result_type ? row.out_result_type.toLowerCase() : 'shot';
      let resultType = '';
      if (row.out_won_by_player1) {
        resultType = resultStr.includes('error') ? 'via opponent\'s' : 'with a';
      } else {
        resultType = resultStr.includes('error') ? 'with a' : 'via opponent\'s';
      }

      // Parse game score for break context
      const [serverGames, receiverGames] = row.out_game_score.split('-').map(Number);
      const isLateBreak = serverGames >= 5;
      const isBreakBack = serverGames > receiverGames;
      
      // Condition 1: Strong Finish
      if (row.out_is_set_point === true && row.out_winning_streak >= 3) {
        momentObj = {
          moment: 'Strong Finish',
          description: row.out_is_match_point === true
            ? `Won the final ${row.out_winning_streak} games to close out the match`
            : `Won the last ${row.out_winning_streak} games of set ${row.out_set_number}`
        };
      } 
      // Condition 2: Clutch Hold
      else if (row.out_is_break_point === true && row.out_server_is_player1 === true && row.out_won_by_player1 === true && row.out_break_point_opportunities >= 2) {
        momentObj = {
          moment: 'Clutch Hold',
          description: `Saved ${row.out_break_point_opportunities} break points in Set ${row.out_set_number}, Game ${row.out_game_number}`
        };
      } 

      // Condition 3: Clutch Break
      else if (row.out_is_break_point === true && row.out_server_is_player1 === false && row.out_won_by_player1 === true && (isLateBreak || isBreakBack)) {
        let clutchDescription = '';
        let clutchMomentName = 'Clutch Break';

        if (isLateBreak && isBreakBack) {
          clutchMomentName = 'Clutch Break Back';
          clutchDescription = `Broke back in Set ${row.out_set_number}, Game ${row.out_game_number} to stay in it`;
        } else if (isBreakBack) {
          clutchMomentName = 'Break Back';
          clutchDescription = `Closed the gap in Set ${row.out_set_number}, Game ${row.out_game_number}`;
        } else if (isLateBreak) {
          clutchDescription = `Took the lead in Set ${row.out_set_number}, Game ${row.out_game_number}`;
        }

        momentObj = {
          moment: clutchMomentName,
          description: clutchDescription
        };
      }

      // Condition 4: Missed Opportunity
      else if (row.out_server_is_player1 === false && row.out_won_by_player1 === false && row.out_break_point_opportunities >= 3) {
        momentObj = {
          moment: 'Missed Opportunity',
          description: `No conversion with ${row.out_break_point_opportunities} break point opportunities in Set ${row.out_set_number}, Game ${row.out_game_number}`
        };
      }

      // Condition 5: Momentum Shift
      else if (row.out_rally_length >= 10) {
        // Check if the number sounds like it starts with a vowel (11, 18, or 8x)
        const article = (row.out_rally_length === 11 || row.out_rally_length === 18 || row.out_rally_length.toString().startsWith('8')) ? 'an' : 'a';

        momentObj = {
          moment: 'Momentum Shift',
          description: row.out_won_by_player1
            ? `Won ${article} ${row.out_rally_length} shot rally ${resultType} ${resultStr}`
            : `Lost ${article} ${row.out_rally_length} shot rally ${resultType} ${resultStr}`
        }
      }

      // Condition 6: Generic Break Point
      else if (row.out_is_break_point === true) {
        momentObj = {
          moment: `Break in Set ${row.out_set_number}, Game ${row.out_game_number}`,
          description: row.out_won_by_player1 === true
            ? `Converted break point ${resultType} ${resultStr}`
            : `Got broken ${resultType} ${resultStr}`
        };
      }
      

      // Condition 7: If a condition was met, push it to our array. Otherwise, it skips the row.out_
      if (momentObj !== null) {
        acc.push(momentObj);
      }

      return acc;
    }, []);

    console.log(`✅ Generated ${keyMomentsJson.length} moments to insert.`);

    // 5. Update the match_stats table
    console.log('💾 Updating matches table with JSONB array...');
    const { error: updateError } = await supabase
      .from('matches')
      .update({ key_moments: keyMomentsJson }) 
      .eq('id', match_id);

    if (updateError) throw updateError;

    console.log('🎉 Successfully updated matches!');

    return new Response(
      JSON.stringify({ success: true, updated_data: keyMomentsJson }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err: any) {
    console.error('🔥 FATAL ERROR:', err);
    return new Response(
      JSON.stringify({ error: err.message || JSON.stringify(err) }), 
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
