const metric=(id,label,aliases)=>({id,label,aliases});
const group=(id,label,metrics)=>({id,label,metrics});
const spec=(label,team,player,events)=>({label,team,player,events});

export const SPORT_STAT_CATALOG={
 football:spec("Association football",[
  group("scoring","Score and scoring",["goals","goals_scored","score","own_goals","penalties_scored"]),
  group("possession","Possession and territory",[metric("possession","Possession",["possession","ball_possession","possession_pct"]),metric("attacks","Attacks",["attacks","total_attacks","attacking_moves"]),metric("dangerous_attacks","Dangerous attacks",["dangerous_attacks","danger_attacks"]),metric("field_tilt","Field tilt",["field_tilt"])]),
  group("passing","Passing and build-up",["passes_total","total_passes","passes_accurate","accurate_passes","passes_pct","pass_accuracy","key_passes","long_passes","progressive_passes","progressive_carries","through_balls","crosses_total","crosses_successful","crosses"]),
  group("shooting","Shots and chance quality",["shots_total","total_shots","shots_on_target","shots_off_target","shots_blocked","shots_inside_box","shots_outside_box","big_chances","expected_goals","xg","expected_assists","xa"]),
  group("defending","Defending and duels",["tackles_total","tackles","tackles_successful","interceptions","clearances","blocks","defensive_blocks","recoveries","duels_won","duels_total","aerial_duels_won","aerial_duels_total","pressures"]),
  group("discipline","Discipline and fouls",["fouls","fouls_committed","fouls_suffered","offsides","yellow_cards","red_cards","second_yellow_cards"]),
  group("set_pieces","Restarts and set pieces",["corners","corner_kicks","free_kicks","goal_kicks","throw_ins","penalties","penalty_awarded","penalty_scored"]),
  group("goalkeeping","Goalkeeping",["saves","goalkeeper_saves","goals_conceded","clean_sheets","high_claims","punches","sweeper_actions"]),
  group("advanced","Advanced tactical metrics",["ppda","passes_into_final_third","passes_into_penalty_area","counterattacks","high_turnovers","expected_threat","obv","xg_chain"])
 ],[
  group("appearance","Appearance and role",["minutes","minutes_played","starting","starter","position","substitute","shirt_number"]),
  group("rating","Player ratings",["rating","player_rating","performance_score","performance_rating"]),
  group("attacking","Attacking output",["goals","assists","shots","shots_total","shots_on_target","xg","expected_goals","xa","expected_assists","key_passes","chances_created","big_chances_created"]),
  group("passing","Passing",["passes_total","passes_accurate","pass_accuracy","key_passes","long_passes","through_balls","crosses","progressive_passes"]),
  group("defending","Defensive output",["tackles","interceptions","clearances","blocks","recoveries","pressures","defensive_duels"]),
  group("duels","Duels and ball carrying",["duels_won","duels_total","aerials_won","aerial_duels_won","dribbles_attempted","dribbles_successful","dribbles_completed","dispossessed","fouled"]),
  group("discipline","Discipline",["yellow_cards","red_cards","fouls_committed","fouls_drawn","offsides"]),
  group("goalkeeping","Goalkeeper metrics",["saves","goals_conceded","penalties_saved","punches","high_claims","save_percentage"])
 ],["kick_off","period_start","period_end","goals","own_goal","penalty_awarded","penalty_scored","penalty_missed","shots","shots_on_target","shots_off_target","shots_blocked","saves","passes","tackles","interceptions","clearances","corners","free_kicks","goal_kicks","throw_ins","offsides","fouls","yellow_card","red_card","substitutions","var_review","var_decision","injury_stoppage","added_time","final_whistle"]),
 basketball:spec("Basketball",[
  group("scoring","Scoring",["points","field_goals_made","field_goals_attempted","two_point_made","three_point_made","free_throws_made"]),
  group("shooting","Shooting efficiency",["field_goal_pct","three_point_pct","free_throw_pct","effective_field_goal_pct","true_shooting_pct"]),
  group("rebounding","Rebounding",["rebounds","offensive_rebounds","defensive_rebounds"]),
  group("playmaking","Playmaking and possession",["assists","turnovers","steals","blocks","plus_minus","possessions"]),
  group("discipline","Fouls and time",["personal_fouls","team_fouls","technical_fouls","minutes"]),
  group("advanced","Advanced",["offensive_rating","defensive_rating","pace","usage_rate","efficiency"])
 ],[
  group("appearance","Minutes and role",["minutes","starter","position","plus_minus"]),
  group("scoring","Scoring",["points","field_goals_made","field_goals_attempted","two_point_made","three_point_made","free_throws_made"]),
  group("shooting","Shooting splits",["field_goal_pct","three_point_pct","free_throw_pct","true_shooting_pct"]),
  group("rebounding","Rebounding",["rebounds","offensive_rebounds","defensive_rebounds"]),
  group("playmaking","Playmaking",["assists","turnovers","steals","blocks"]),
  group("advanced","Advanced",["usage_rate","efficiency","plus_minus"])
 ],["tip_off","period_start","period_end","made_shot","missed_shot","free_throw","rebound","assist","steal","block","turnover","foul","substitution","timeout","jump_ball","possession_change"]),
 american_football:spec("American football",[
  group("passing","Passing",["pass_attempts","completions","passing_yards","passing_touchdowns","interceptions","sacks","passer_rating"]),
  group("rushing","Rushing",["rush_attempts","rushing_yards","rushing_touchdowns","yards_per_carry"]),
  group("receiving","Receiving",["targets","receptions","receiving_yards","receiving_touchdowns","yards_after_catch"]),
  group("defense","Defense",["total_tackles","solo_tackles","assisted_tackles","sacks","tackles_for_loss","forced_fumbles","fumble_recoveries","passes_defended","interceptions"]),
  group("special_teams","Special teams",["kickoffs","kickoff_yards","touchbacks","punts","punt_yards","field_goals","extra_points","kick_returns","punt_returns"]),
  group("team_context","Game context",["offensive_plays","total_yards","first_downs","third_down_attempts","third_down_conversions","fourth_down_attempts","fourth_down_conversions","red_zone_attempts","turnovers","sacks_allowed","penalties","penalty_yards"]),
  group("advanced","Advanced play metrics",["epa","success_rate","air_yards","yards_after_catch","win_probability_added"])
 ],[
  group("appearance","Appearance and role",["minutes","starter","position"]),
  group("passing","Quarterback",["pass_attempts","completions","passing_yards","passing_touchdowns","interceptions","sacks_taken","passer_rating"]),
  group("rushing","Rushing",["rush_attempts","rushing_yards","rushing_touchdowns","fumbles_lost"]),
  group("receiving","Receiving",["targets","receptions","receiving_yards","receiving_touchdowns"]),
  group("defense","Defense",["solo_tackles","assisted_tackles","sacks","half_sacks","interceptions","fumble_recoveries","passes_defended"]),
  group("special_teams","Special teams",["field_goal_attempts","field_goals_made","extra_point_attempts","extra_points_made","kickoff_returns","punt_returns"])
 ],["kickoff","kickoff_return","punt","punt_return","snap","pass_attempt","completion","incompletion","rush","tackle","sack","interception","fumble","touchdown","field_goal","extra_point","penalty","timeout","safety","quarter_start","quarter_end"]),
 ice_hockey:spec("Ice hockey",[
  group("scoring","Scoring",["goals","assists","points","plus_minus"]),
  group("shooting","Shots",["shots_on_goal","shots","missed_shots","blocked_shots","shooting_pct"]),
  group("possession","Possession and faceoffs",["faceoffs_won","faceoffs_lost","faceoff_pct","takeaways","giveaways"]),
  group("physical","Physical play",["hits","body_checks","blocked_shots"]),
  group("discipline","Penalties",["penalty_minutes","penalties"]),
  group("goalkeeping","Goaltending",["saves","shots_faced","save_pct","goals_against","goals_saved_above_expected"]),
  group("special_teams","Special teams",["power_play_goals","power_play_opportunities","short_handed_goals","power_play_pct"])
 ],[
  group("appearance","Shift and ice time",["time_on_ice","shifts","starter","position"]),
  group("scoring","Scoring",["goals","assists","points","plus_minus"]),
  group("shooting","Shots",["shots_on_goal","shooting_pct","blocked_shots"]),
  group("physical","Physical play",["hits","takeaways","giveaways"]),
  group("faceoffs","Faceoffs",["faceoffs_won","faceoffs_lost","faceoff_pct"]),
  group("discipline","Discipline",["penalty_minutes","penalties"]),
  group("goalkeeping","Goaltending",["saves","shots_faced","save_pct","goals_against"])
 ],["puck_drop","period_start","period_end","shot","goal","save","blocked_shot","hit","faceoff","icing","offside","penalty","power_play_start","power_play_end","empty_net","substitution","timeout"]),
 baseball:spec("Baseball",[
  group("batting","Batting",["at_bats","runs","hits","singles","doubles","triples","home_runs","rbi","walks","strikeouts","hit_by_pitch","stolen_bases","caught_stealing","total_bases","batting_average","obp","slg","ops"]),
  group("pitching","Pitching",["innings_pitched","pitch_count","strikeouts","walks_allowed","hits_allowed","runs_allowed","earned_runs","era","whip","pitch_velocity"]),
  group("fielding","Fielding",["putouts","assists","errors","double_plays","fielding_pct"]),
  group("game_context","Game context",["balls","strikes","outs","base_runners","left_on_base"])
 ],[
  group("batting","Batting",["at_bats","runs","hits","home_runs","rbi","walks","strikeouts","stolen_bases","total_bases"]),
  group("pitching","Pitching",["innings_pitched","pitch_count","strikeouts","walks_allowed","hits_allowed","earned_runs","pitch_velocity"]),
  group("fielding","Fielding",["putouts","assists","errors"])
 ],["first_pitch","pitch","ball","strike","foul_ball","hit","single","double","triple","home_run","walk","strikeout","hit_by_pitch","stolen_base","caught_stealing","out","error","substitution","mound_visit","inning_start","inning_end"]),
 tennis:spec("Tennis",[
  group("serve","Serve",["aces","double_faults","first_serve_in","first_serve_pct","first_serve_points_won","second_serve_points_won","service_games","service_games_won","service_points_won"]),
  group("return","Return",["return_points_won","break_points_faced","break_points_saved","break_points_converted","break_points"]),
  group("rally","Rally and points",["winners","unforced_errors","forced_errors","total_points_won","games_won","sets_won","tiebreaks_won"]),
  group("movement","Movement",["distance_covered","sprint_count","net_points_won"]),
  group("match_context","Match context",["match_duration","retirement","walkover","medical_timeouts"])
 ],[
  group("serve","Serve",["aces","double_faults","first_serve_in","first_serve_pct","first_serve_points_won","second_serve_points_won"]),
  group("return","Return",["return_points_won","break_points_faced","break_points_saved","break_points_converted"]),
  group("rally","Rally",["winners","unforced_errors","forced_errors","total_points_won","net_points_won"]),
  group("movement","Movement",["distance_covered","sprint_count"])
 ],["match_start","set_start","set_end","game_start","game_end","point_start","point_end","ace","double_fault","serve_fault","break_point","break_point_saved","break_point_converted","tiebreak","medical_timeout","challenge","retirement","walkover","match_end"]),
 volleyball:spec("Volleyball",[
  group("scoring","Scoring",["points","sets_won","set_score"]),
  group("attack","Attack",["attack_attempts","kills","attack_errors","attack_efficiency"]),
  group("serve","Serve",["aces","serve_errors","serve_attempts"]),
  group("block","Blocking",["blocks","block_points"]),
  group("defense","Defense",["digs","receptions","reception_errors","assists"])
 ],[
  group("attack","Attack",["kills","attack_attempts","attack_errors","attack_efficiency"]),
  group("serve","Serve",["aces","serve_errors"]),
  group("block","Blocking",["blocks","block_points"]),
  group("defense","Defense",["digs","receptions","reception_errors","assists"]),
  group("appearance","Playing time and role",["sets_played","starter","position"])
 ],["rally_start","rally_end","serve","ace","attack","kill","block","dig","reception","set","substitution","timeout","challenge","set_point","match_point"]),
 cricket:spec("Cricket",[
  group("batting","Batting",["runs","balls_faced","fours","sixes","strike_rate","dismissal"]),
  group("bowling","Bowling",["overs","maidens","runs_conceded","wickets","economy","dot_balls","no_balls","wides"]),
  group("fielding","Fielding",["catches","run_outs","stumpings"]),
  group("innings","Innings context",["team_score","wickets_lost","run_rate","partnership_runs"])
 ],[
  group("batting","Batting",["runs","balls_faced","fours","sixes","strike_rate"]),
  group("bowling","Bowling",["overs","maidens","runs_conceded","wickets","economy","dot_balls"]),
  group("fielding","Fielding",["catches","run_outs","stumpings"])
 ],["coin_toss","innings_start","over_start","ball","run","four","six","wicket","no_ball","wide","bye","leg_bye","review","drinks_break","innings_end"]),
 handball:spec("Handball",[
  group("scoring","Scoring",["goals","shots","shot_accuracy","assists"]),
  group("goalkeeping","Goalkeeping",["saves","save_pct","goals_conceded"]),
  group("discipline","Discipline",["suspensions","two_minute_exclusions","yellow_cards","red_cards"]),
  group("team_play","Team play",["fast_break_goals","turnovers","technical_faults","penalties"])
 ],[
  group("scoring","Scoring",["goals","shots","assists","shot_accuracy"]),
  group("goalkeeping","Goalkeeping",["saves","save_pct","goals_conceded"]),
  group("discipline","Discipline",["suspensions","two_minute_exclusions","yellow_cards","red_cards"]),
  group("appearance","Appearance",["minutes","starter","position"])
 ],["throw_off","goal","shot","save","seven_meter","two_minute_suspension","yellow_card","red_card","timeout","substitution","period_start","period_end"]),
 rugby:spec("Rugby",[
  group("scoring","Scoring",["tries","conversions","penalties","drop_goals","points"]),
  group("carrying","Carrying",["carries","meters_gained","clean_breaks","defenders_beaten"]),
  group("passing","Passing",["passes","offloads","handling_errors"]),
  group("defense","Defense",["tackles_made","missed_tackles","dominant_tackles","turnovers_won"]),
  group("discipline","Discipline",["penalties_conceded","yellow_cards","red_cards"])
 ],[
  group("scoring","Scoring",["tries","conversions","points"]),
  group("carrying","Carrying",["carries","meters_gained","clean_breaks","defenders_beaten"]),
  group("passing","Passing",["passes","offloads","handling_errors"]),
  group("defense","Defense",["tackles_made","missed_tackles","turnovers_won"]),
  group("discipline","Discipline",["penalties_conceded","yellow_cards","red_cards"])
 ],["kick_off","try","conversion","penalty","drop_goal","tackle","ruck","maul","scrum","lineout","knock_on","turnover","yellow_card","red_card","substitution","period_start","period_end"]),
 futsal:spec("Futsal",[
  group("scoring","Scoring",["goals","shots","shots_on_target"]),
  group("possession","Possession",["possession","passes","pass_accuracy","attacks","dangerous_attacks"]),
  group("discipline","Discipline",["fouls","accumulated_fouls","yellow_cards","red_cards"]),
  group("set_pieces","Set pieces",["corners","kick_ins","penalties","second_penalty"])
 ],[
  group("scoring","Scoring",["goals","assists","shots"]),
  group("goalkeeping","Goalkeeping",["saves","goals_conceded"]),
  group("discipline","Discipline",["fouls","yellow_cards","red_cards"]),
  group("appearance","Appearance",["minutes","starter","position"])
 ],["kick_off","goal","shot","save","foul","accumulated_foul","timeout","power_play","kick_in","corner","penalty","substitution","period_end"]),
 boxing_mma:spec("Boxing and MMA",[
  group("striking","Striking",["significant_strikes","total_strikes","strikes_landed","strikes_attempted","head_strikes","body_strikes","leg_strikes"]),
  group("grappling","Grappling",["takedowns","takedown_accuracy","submission_attempts","control_time","reversals"]),
  group("fight_context","Fight context",["knockdowns","rounds","fight_duration","fight_result","method_of_victory"])
 ],[
  group("striking","Striking",["significant_strikes","total_strikes","strikes_landed","strikes_attempted"]),
  group("grappling","Grappling",["takedowns","submission_attempts","control_time","reversals"]),
  group("fight_context","Fight context",["knockdowns","fight_duration","method_of_victory"])
 ],["round_start","significant_strike","knockdown","takedown","submission_attempt","reversal","clinch","warning","point_deduction","round_end","doctor_check","fight_end"]),
 motorsport:spec("Motorsport",[
  group("pace","Pace",["lap_time","best_lap","sector_times","average_speed","top_speed"]),
  group("race_position","Race position",["position","positions_gained","gap_to_leader","interval"]),
  group("pit","Pit strategy",["pit_stops","pit_stop_duration","tyre_compound","tyre_age"]),
  group("race_control","Race control",["safety_car","virtual_safety_car","red_flags","penalties","track_limits"])
 ],[
  group("pace","Driver pace",["lap_time","best_lap","sector_times","average_speed","top_speed"]),
  group("race_position","Race position",["position","positions_gained","gap_to_leader"]),
  group("pit","Pit and tyre data",["pit_stops","pit_stop_duration","tyre_compound","tyre_age"])
 ],["session_start","lap_start","sector","pit_entry","pit_exit","overtake","yellow_flag","safety_car","virtual_safety_car","red_flag","penalty","chequered_flag"]),
 golf:spec("Golf",[
  group("scoring","Scoring",["strokes","score_to_par","birdies","eagles","bogeys","double_bogeys"]),
  group("driving","Driving",["driving_distance","driving_accuracy","fairways_hit"]),
  group("approach","Approach",["greens_in_regulation","approach_proximity"]),
  group("short_game","Short game",["scrambling","sand_saves","putts","putts_per_round"])
 ],[
  group("scoring","Scoring",["strokes","score_to_par","birdies","eagles","bogeys"]),
  group("driving","Driving",["driving_distance","driving_accuracy","fairways_hit"]),
  group("approach","Approach",["greens_in_regulation","approach_proximity"]),
  group("short_game","Short game",["scrambling","sand_saves","putts"])
 ],["round_start","hole_start","shot","putt","penalty_stroke","hole_complete","round_complete"]),
 esports:spec("Esports",[
  group("combat","Combat",["kills","deaths","assists","damage_dealt","damage_taken","headshots"]),
  group("objectives","Objectives",["objectives_captured","objective_time","plants","defuses","towers","dragons","barons"]),
  group("economy","Economy",["gold","credits","economy_rating","equipment_value"]),
  group("map","Map and rounds",["rounds_won","maps_won","first_bloods","clutch_wins"])
 ],[
  group("combat","Combat",["kills","deaths","assists","damage_dealt","headshots"]),
  group("objectives","Objectives",["objectives_captured","objective_time","plants","defuses"]),
  group("economy","Economy",["gold","credits","economy_rating"])
 ],["map_start","round_start","kill","death","assist","objective","plant","defuse","timeout","round_end","map_end"]),
 table_tennis:spec("Table tennis",[
  group("scoring","Scoring",["games_won","points_won","sets_won"]),
  group("serve","Serve",["aces","service_points_won","serve_errors"]),
  group("rally","Rally",["winners","unforced_errors","forced_errors","receive_points_won"])
 ],[
  group("scoring","Scoring",["points_won","games_won","sets_won"]),
  group("serve","Serve",["aces","service_points_won"]),
  group("rally","Rally",["winners","unforced_errors","forced_errors"])
 ],["match_start","game_start","point","serve","let","timeout","game_end","match_end"]),
 badminton:spec("Badminton",[
  group("scoring","Scoring",["points_won","games_won","sets_won"]),
  group("rally","Rally",["winners","unforced_errors","forced_errors","smashes","net_points"]),
  group("serve","Serve",["service_points_won","service_errors"])
 ],[
  group("scoring","Scoring",["points_won","games_won","sets_won"]),
  group("rally","Rally",["winners","unforced_errors","smashes","net_points"]),
  group("serve","Serve",["service_points_won","service_errors"])
 ],["match_start","game_start","rally_start","point","challenge","interval","game_end","match_end"]),
 darts:spec("Darts",[
  group("scoring","Scoring",["three_dart_average","180s","140_plus","100_plus","checkout_percentage","highest_checkout"]),
  group("finishing","Finishing",["darts_at_double","doubles_hit","doubles_attempted","legs_won","sets_won"])
 ],[
  group("scoring","Scoring",["three_dart_average","180s","140_plus","100_plus","checkout_percentage"]),
  group("finishing","Finishing",["darts_at_double","doubles_hit","doubles_attempted","legs_won","sets_won"])
 ],["leg_start","visit","180","checkout_attempt","checkout","leg_end","set_end","match_end"]),
 snooker:spec("Snooker",[
  group("scoring","Scoring",["points","breaks","highest_break","centuries","maximum_break"]),
  group("safety","Safety",["safety_success","snookers","fouls","free_ball"])
 ],[
  group("scoring","Scoring",["points","breaks","highest_break","centuries","maximum_break"]),
  group("safety","Safety",["safety_success","snookers","fouls"])
 ],["frame_start","shot","pot","miss","foul","free_ball","break","frame_end"]),
 horse_racing:spec("Horse racing",[
  group("race","Race",["finish_position","finish_time","starting_price","official_rating","carried_weight"]),
  group("sectionals","Sectionals",["sectional_times","speed_figure","pace","stride_length","stride_frequency"])
 ],[
  group("runner","Horse profile",["finish_position","finish_time","starting_price","official_rating","carried_weight"]),
  group("jockey","Jockey metrics",["jockey","jockey_win_rate"]),
  group("trainer","Trainer metrics",["trainer","trainer_win_rate"])
 ],["race_start","break","position_change","furlong_split","incident","finish","stewards_inquiry","result_confirmed"]),
 cycling:spec("Cycling",[
  group("performance","Performance",["elapsed_time","average_speed","power_watts","normalized_power","distance","climbing_meters"]),
  group("race","Race position",["position","time_gap","points","mountain_points","sprint_points"])
 ],[
  group("performance","Performance",["power_watts","normalized_power","average_speed","distance","climbing_meters","heart_rate","cadence"]),
  group("race","Race position",["position","time_gap","points"])
 ],["start","intermediate_sprint","climb","crash","breakaway","peloton_split","finish"]),
 water_sports:spec("Water sports",[
  group("race","Race and result",["finish_time","finish_position","splits","distance","reaction_time","disqualification"]),
  group("technique","Technique and movement",["stroke_rate","stroke_count","distance_per_stroke","starts","turns","underwater_distance"]),
  group("conditions","Course and conditions",["lane","pool_length","water_conditions","wind_speed"])
 ],[
  group("performance","Athlete performance",["finish_time","finish_position","splits","stroke_rate","stroke_count","distance_per_stroke","reaction_time"]),
  group("technique","Starts, turns and technique",["starts","turns","underwater_distance"])
 ],["race_start","false_start","lap","split","turn","relay_exchange","finish","disqualification","record"]),
 athletics:spec("Athletics and track & field",[
  group("result","Event result",["finish_time","finish_position","distance","height","attempts","wind_assistance"]),
  group("pace","Splits and pace",["splits","lap_times","reaction_time","intermediate_positions"]),
  group("technical","Technical attempts",["fouls","valid_attempts","best_attempt","throw_distance","jump_height"])
 ],[
  group("result","Athlete result",["finish_time","finish_position","distance","height","wind_assistance"]),
  group("pace","Pace and splits",["splits","lap_times","reaction_time"]),
  group("technical","Attempts",["attempts","fouls","valid_attempts","best_attempt"])
 ],["call_room","start","false_start","lap","split","attempt","foul","valid_attempt","finish","disqualification"]),
 greyhound_racing:spec("Greyhound racing",[
  group("race","Race result",["trap_draw","finish_position","finish_time","starting_price","distance","going"]),
  group("sectionals","Sectionals and pace",["split_time","sectional_time","early_pace","speed_figure"]),
  group("race_context","Race context",["grade","field_size","track","weather","stewards_inquiry"])
 ],[
  group("runner","Greyhound performance",["trap_draw","finish_position","finish_time","split_time","sectional_time","early_pace","speed_figure"]),
  group("runner_context","Runner context",["weight","trainer","days_since_last_run"])
 ],["race_start","trap_open","break","sectional","position_change","interference","finish","result_confirmed","stewards_inquiry"]),
 field_hockey:spec("Field hockey",[
  group("scoring","Scoring",["goals","penalty_strokes","field_goals","shots","shots_on_target"]),
  group("possession","Possession and territory",["possession","circle_entries","attacking_third_entries","turnovers","counterattacks"]),
  group("set_pieces","Set pieces",["penalty_corners","penalty_corner_goals","free_hits","long_corners"]),
  group("defending","Defending",["tackles","interceptions","blocks","clearances","recoveries"]),
  group("discipline","Discipline",["green_cards","yellow_cards","red_cards","suspensions"]),
  group("goalkeeping","Goalkeeping",["saves","goals_conceded","save_percentage"])
 ],[
  group("appearance","Appearance and role",["minutes","starter","position"]),
  group("scoring","Attacking output",["goals","assists","shots","shots_on_target","penalty_corner_goals"]),
  group("possession","Possession and creation",["circle_entries","key_passes","turnovers","recoveries"]),
  group("defending","Defending",["tackles","interceptions","blocks","clearances"]),
  group("discipline","Discipline",["green_cards","yellow_cards","red_cards","fouls_committed"]),
  group("goalkeeping","Goalkeeping",["saves","goals_conceded","save_percentage"])
 ],["push_back","match_start","goal","penalty_corner","penalty_stroke","shot","save","turnover","tackle","green_card","yellow_card","red_card","period_start","period_end","match_end"]),
 water_polo:spec("Water polo",[
  group("scoring","Scoring",["goals","shots","shots_on_target","shooting_pct","man_up_goals","penalty_goals"]),
  group("possession","Possession and attack",["exclusions_drawn","turnovers","steals","assists","counterattacks"]),
  group("defending","Defending",["blocks","field_blocks","exclusions","steals"]),
  group("goalkeeping","Goalkeeping",["saves","shots_faced","save_pct","goals_conceded"])
 ],[
  group("appearance","Appearance and role",["minutes","starter","position"]),
  group("scoring","Attacking output",["goals","shots","shots_on_target","assists","man_up_goals","penalty_goals"]),
  group("defending","Defending",["blocks","steals","exclusions","exclusions_drawn"]),
  group("goalkeeping","Goalkeeping",["saves","shots_faced","save_pct","goals_conceded"])
 ],["swim_off","period_start","period_end","possession_change","goal","exclusion","penalty_throw","shot","save","timeout","substitution","match_end"]),
 lacrosse:spec("Lacrosse",[
  group("scoring","Scoring",["goals","assists","points","shots","shots_on_goal","shooting_pct"]),
  group("possession","Possession and transition",["faceoffs_won","faceoffs_lost","ground_balls","turnovers","clear_attempts","clear_successes"]),
  group("defending","Defending",["caused_turnovers","checks","blocked_shots","penalties"]),
  group("goalkeeping","Goalkeeping",["saves","shots_faced","save_pct","goals_allowed"])
 ],[
  group("appearance","Appearance and role",["minutes","starter","position"]),
  group("scoring","Scoring",["goals","assists","points","shots","shots_on_goal"]),
  group("possession","Possession",["faceoffs_won","faceoffs_lost","ground_balls","turnovers"]),
  group("defending","Defending",["caused_turnovers","checks","blocked_shots","penalties"]),
  group("goalkeeping","Goalkeeping",["saves","shots_faced","save_pct","goals_allowed"])
 ],["faceoff","period_start","period_end","goal","assist","shot","save","ground_ball","check","turnover","penalty","timeout","substitution","match_end"]),
 floorball:spec("Floorball",[
  group("scoring","Scoring",["goals","assists","points","shots","shots_on_goal","shooting_pct"]),
  group("possession","Possession",["ball_recoveries","turnovers","takeaways","passes"]),
  group("defending","Defending",["blocks","interceptions","penalty_minutes","fouls"]),
  group("goalkeeping","Goalkeeping",["saves","shots_faced","save_pct","goals_conceded"])
 ],[
  group("appearance","Appearance and role",["minutes","starter","position"]),
  group("scoring","Scoring",["goals","assists","points","shots","shots_on_goal"]),
  group("possession","Possession",["ball_recoveries","turnovers","takeaways","passes"]),
  group("defending","Defending",["blocks","interceptions","penalty_minutes","fouls"]),
  group("goalkeeping","Goalkeeping",["saves","shots_faced","save_pct","goals_conceded"])
 ],["faceoff","period_start","period_end","goal","assist","shot","save","block","turnover","penalty","timeout","substitution","match_end"]),
 squash_padel:spec("Squash and padel",[
  group("scoring","Scoring",["points_won","games_won","sets_won","matches_won"]),
  group("serve","Serve and return",["aces","double_faults","first_serve_pct","service_points_won","return_points_won","break_points"]),
  group("rally","Rally quality",["winners","unforced_errors","forced_errors","net_points_won","smashes","volley_winners"]),
  group("movement","Movement",["distance_covered","sprint_count","rally_duration"])
 ],[
  group("scoring","Scoring",["points_won","games_won","sets_won"]),
  group("serve","Serve and return",["aces","double_faults","first_serve_pct","service_points_won","return_points_won","break_points"]),
  group("rally","Rally quality",["winners","unforced_errors","forced_errors","net_points_won","smashes","volley_winners"]),
  group("movement","Movement",["distance_covered","sprint_count","rally_duration"])
 ],["match_start","set_start","set_end","game_start","game_end","serve","point_start","point_end","ace","double_fault","winner","unforced_error","break_point","medical_timeout","match_end"]),
 winter_sports:spec("Winter sports",[
  group("result","Event result",["finish_time","finish_position","time_gap","points","distance","speed"]),
  group("technical","Technical performance",["shooting_accuracy","shooting_misses","jumps","jump_distance","style_points","penalty_seconds"]),
  group("splits","Splits and pace",["splits","sectional_times","intermediate_positions"]),
  group("conditions","Conditions",["snow_conditions","wind_speed","temperature","course_profile"])
 ],[
  group("result","Athlete result",["finish_time","finish_position","time_gap","points","distance","speed"]),
  group("technical","Technical performance",["shooting_accuracy","shooting_misses","jumps","jump_distance","style_points","penalty_seconds"]),
  group("splits","Splits and pace",["splits","sectional_times","intermediate_positions"])
 ],["start","split","shooting_stage","miss","penalty_loop","jump","landing","crash","intermediate_position","finish","disqualification"])
};

const aliases={
 soccer:"football","ice-hockey":"ice_hockey","american football":"american_football","mma":"boxing_mma","boxing":"boxing_mma","formula 1":"motorsport","f1":"motorsport"
};
export function normalizeSportId(value){
 const key=String(value??"").trim().toLowerCase().replace(/\s+/g," ");
 return aliases[key]||key.replace(/-/g,"_");
}
export function getSportStatSpec(sport){
 const id=normalizeSportId(sport);
 const base=SPORT_STAT_CATALOG[id]||{label:"Sport-specific coverage not catalogued",team:[],player:[],events:[]};
 const ratingGroup=group("rating","Provider-defined player rating",[
  metric("rating","Rating",["rating","player_rating","performance_score","performance_rating"])
 ]);
 const player=Array.isArray(base.player)?base.player:[];
 return {sportId:id,...base,player:player.some(item=>item.id==="rating")?player:[ratingGroup,...player]};
}
function normalizeKey(value){return String(value??"").replace(/([a-z])([A-Z])/g,"$1 $2").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
export function flattenStatisticKeys(value,maxDepth=8){
 const found=new Set();
 const visit=(node,depth)=>{
  if(depth>maxDepth||node===null||node===undefined)return;
  if(Array.isArray(node)){for(const item of node)visit(item,depth+1);return;}
  if(typeof node!=="object")return;
  for(const [key,child] of Object.entries(node)){found.add(normalizeKey(key));visit(child,depth+1);}
 };
 visit(value,0);return [...found];
}
export function collectEventTypeValues(value,maxDepth=8){
 const found=new Set();
 const visit=(node,depth)=>{if(depth>maxDepth||node===null||node===undefined)return;if(Array.isArray(node)){for(const x of node)visit(x,depth+1);return;}if(typeof node!=="object")return;for(const [key,child] of Object.entries(node)){if(["type","eventtype","event_type","kind","eventname","event_name"].includes(key.toLowerCase())&&typeof child==="string")found.add(normalizeKey(child));if(["eventtypes","event_types"].includes(key.toLowerCase())&&Array.isArray(child))for(const value of child)if(typeof value==="string")found.add(normalizeKey(value));visit(child,depth+1);}};
 visit(value,0);return [...found];
}
export function inspectStatisticCoverage(sport,details={}){
 const config=getSportStatSpec(sport);
 const keys=flattenStatisticKeys(details);
 const inspect=(groups)=>groups.map(g=>{
  const metrics=g.metrics.map(value=>typeof value==="string"?metric(value,value.replace(/_/g," "),[value]):value);
  const available=metrics.flatMap(m=>m.aliases.filter(alias=>keys.includes(normalizeKey(alias))).map(()=>m.id));
  const present=[...new Set(available)];
  return {id:g.id,label:g.label,status:present.length===0?"not_provided":present.length===metrics.length?"present":"partial",availableMetrics:present,missingMetrics:metrics.filter(m=>!present.includes(m.id)).map(m=>m.id),availableMetricCount:present.length,expectedMetricCount:metrics.length};
 });
 const team=inspect(config.team||[]),player=inspect(config.player||[]);
 const eventValues=collectEventTypeValues(details);
 const eventCoverage=(config.events||[]).map(name=>({eventType:name,status:eventValues.some(value=>value===normalizeKey(name)||value.includes(normalizeKey(name)))?"present":"not_provided"}));
 const summarize=groups=>({availableGroups:groups.filter(x=>x.availableMetricCount>0).length,totalGroups:groups.length,expectedMetrics:groups.reduce((n,x)=>n+x.expectedMetricCount,0),availableMetrics:groups.reduce((n,x)=>n+x.availableMetricCount,0)});
 const t=summarize(team),p=summarize(player);
 return {sportId:config.sportId,sportLabel:config.label,team,player,eventTypes:eventCoverage,
  summary:{teamGroups:t,playerGroups:p,overallCoveragePct:(t.expectedMetrics+p.expectedMetrics)?Math.round((t.availableMetrics+p.availableMetrics)/(t.expectedMetrics+p.expectedMetrics)*1000)/10:0},
  caveat:"Coverage reflects fields present in this single supplied match record, not proof that the provider supports the metric for every event. A missing field is UNKNOWN/NOT PROVIDED, never zero."};
}
function getPath(obj,path){return path.split(".").reduce((v,k)=>v&&typeof v==="object"?v[k]:undefined,obj);}
function deepFindNumber(obj,wanted,depth=0){
 if(depth>7||obj===null||obj===undefined)return null;
 if(Array.isArray(obj)){for(const x of obj){const got=deepFindNumber(x,wanted,depth+1);if(got!==null)return got;}return null;}
 if(typeof obj!=="object")return null;
 for(const [k,v] of Object.entries(obj)){if(wanted.includes(normalizeKey(k))){const n=Number(v);if(v!==null&&v!==""&&Number.isFinite(n))return n;}}
 for(const v of Object.values(obj)){const got=deepFindNumber(v,wanted,depth+1);if(got!==null)return got;}
 return null;
}
function directValue(obj,keys){
 for(const key of keys){const v=obj?.[key];if(v!==undefined&&v!==null&&v!=="")return v;}
 return null;
}
export function extractPlayerPerformances(details={},providerId=null){
 const roots=["playerStats","playerStatistics","player_stats","player_performances","players","athletes","playerEvents","player_events","boxscore","boxScore"].map(k=>details?.[k]).filter(Boolean);
 const candidates=[];
 const visited=new Set();
 const walk=(node,depth=0)=>{
  if(depth>8||node===null||node===undefined)return;
  if(Array.isArray(node)){for(const item of node)walk(item,depth+1);return;}
  if(typeof node!=="object"||visited.has(node))return;
  visited.add(node);
  const player=directValue(node,["player","athlete","participant"]);
  const identity=player&&typeof player==="object"?player:node;
  const name=directValue(identity,["name","fullName","full_name","displayName","playerName","player_name","Name"])||
    (typeof player==="string"?player:directValue(node,["playerName","player_name"]));
  const hasStats=["statistics","stats","performance","metrics","rating","minutes","minutesPlayed","playerStats","shooting","passing","goals"].some(k=>node[k]!==undefined);
  if(typeof name==="string"&&hasStats){
   const stats=directValue(node,["statistics","stats","performance","metrics"])||node;
   candidates.push({node,identity,name:String(name).slice(0,180),stats});
   return;
  }
  for(const child of Object.values(node))walk(child,depth+1);
 };
 for(const root of roots)walk(root);
 const byPlayer=new Map();
 for(const candidate of candidates){
  const name=candidate.name.trim();if(!name)continue;
  const teamObj=directValue(candidate.node,["team","competitor","club"]);
  const team=typeof teamObj==="string"?teamObj:directValue(teamObj,["name","displayName"])||directValue(candidate.node,["teamName","team_name"]);
  const playerId=directValue(candidate.identity,["id","playerId","player_id","competitorId"]);
  const rating=deepFindNumber(candidate.node,["rating","player rating","performance score","performance_rating"]);
  const minutes=deepFindNumber(candidate.node,["minutes","minutes played","time on ice","time played"]);
  const position=directValue(candidate.node,["position","role"])||directValue(candidate.identity,["position"]);
  const key=String(playerId||name.toLowerCase()+"|"+String(team||"").toLowerCase());
  const record={playerId:playerId===null?null:String(playerId),name,team:team||null,position:position||null,minutes,rating,
   ratingScale:"provider_defined_unverified_scale",providerId,statistics:candidate.stats,rawPlayerRecord:candidate.node};
  const prior=byPlayer.get(key);
  if(!prior||JSON.stringify(record).length>JSON.stringify(prior).length)byPlayer.set(key,record);
 }
 const players=[...byPlayer.values()];
 const rated=players.filter(x=>typeof x.rating==="number");
 const bestRating=rated.length?Math.max(...rated.map(x=>x.rating)):null;
 const lowestRating=rated.length?Math.min(...rated.map(x=>x.rating)):null;
 return {players,ratingsAvailable:rated.length,unratedPlayers:players.length-rated.length,
  bestRated:bestRating===null?[]:rated.filter(x=>x.rating===bestRating),
  lowestRated:lowestRating===null?[]:rated.filter(x=>x.rating===lowestRating),
  comparison:"Only compared within this match and one provider response. Rating formula and scale remain provider-defined; no cross-provider or cross-position normalization is assumed."};
}
