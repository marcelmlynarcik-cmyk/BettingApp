-- Seed initial data for the betting tracker

-- Insert the 3 users
INSERT INTO users (name) VALUES 
  ('Marcel'),
  ('Peter'),
  ('Michal')
ON CONFLICT (name) DO NOTHING;

-- Insert common sports
INSERT INTO sports (name) VALUES 
  ('Football'),
  ('Basketball'),
  ('Tennis'),
  ('Ice Hockey'),
  ('Volleyball'),
  ('Handball'),
  ('Baseball'),
  ('MMA'),
  ('Boxing'),
  ('Esports')
ON CONFLICT (name) DO NOTHING;

-- Insert common leagues for Football
INSERT INTO leagues (sport_id, name)
SELECT s.id, league_name
FROM sports s
CROSS JOIN (VALUES 
  ('Premier League'),
  ('La Liga'),
  ('Bundesliga'),
  ('Serie A'),
  ('Ligue 1'),
  ('Champions League'),
  ('Europa League'),
  ('World Cup'),
  ('Euro Championship'),
  ('MLS')
) AS leagues(league_name)
WHERE s.name = 'Football'
ON CONFLICT DO NOTHING;

-- Insert common leagues for Basketball
INSERT INTO leagues (sport_id, name)
SELECT s.id, league_name
FROM sports s
CROSS JOIN (VALUES 
  ('NBA'),
  ('EuroLeague'),
  ('NCAA'),
  ('WNBA')
) AS leagues(league_name)
WHERE s.name = 'Basketball'
ON CONFLICT DO NOTHING;

-- Insert common leagues for Tennis
INSERT INTO leagues (sport_id, name)
SELECT s.id, league_name
FROM sports s
CROSS JOIN (VALUES 
  ('ATP Tour'),
  ('WTA Tour'),
  ('Grand Slam'),
  ('Davis Cup')
) AS leagues(league_name)
WHERE s.name = 'Tennis'
ON CONFLICT DO NOTHING;

-- Insert common leagues for Ice Hockey
INSERT INTO leagues (sport_id, name)
SELECT s.id, league_name
FROM sports s
CROSS JOIN (VALUES 
  ('NHL'),
  ('KHL'),
  ('SHL'),
  ('World Championship')
) AS leagues(league_name)
WHERE s.name = 'Ice Hockey'
ON CONFLICT DO NOTHING;

-- Insert sample tickets with predictions for demo purposes
DO $$
DECLARE
  marcel_id UUID;
  peter_id UUID;
  michal_id UUID;
  football_id UUID;
  basketball_id UUID;
  tennis_id UUID;
  premier_league_id UUID;
  nba_id UUID;
  atp_id UUID;
  ticket1_id UUID;
  ticket2_id UUID;
  ticket3_id UUID;
  ticket4_id UUID;
  ticket5_id UUID;
BEGIN
  -- Get user IDs
  SELECT id INTO marcel_id FROM users WHERE name = 'Marcel';
  SELECT id INTO peter_id FROM users WHERE name = 'Peter';
  SELECT id INTO michal_id FROM users WHERE name = 'Michal';
  
  -- Get sport IDs
  SELECT id INTO football_id FROM sports WHERE name = 'Football';
  SELECT id INTO basketball_id FROM sports WHERE name = 'Basketball';
  SELECT id INTO tennis_id FROM sports WHERE name = 'Tennis';
  
  -- Get league IDs
  SELECT id INTO premier_league_id FROM leagues WHERE name = 'Premier League' AND sport_id = football_id;
  SELECT id INTO nba_id FROM leagues WHERE name = 'NBA' AND sport_id = basketball_id;
  SELECT id INTO atp_id FROM leagues WHERE name = 'ATP Tour' AND sport_id = tennis_id;
  
  -- Create sample tickets
  INSERT INTO tickets (date, stake, combined_odds, payout, possible_win, status, description)
  VALUES ('2024-01-15', 50.00, 4.25, 212.50, 212.50, 'win', 'Weekend combo')
  RETURNING id INTO ticket1_id;
  
  INSERT INTO tickets (date, stake, combined_odds, payout, possible_win, status, description)
  VALUES ('2024-01-20', 30.00, 3.50, 0, 105.00, 'loss', 'Midweek special')
  RETURNING id INTO ticket2_id;
  
  INSERT INTO tickets (date, stake, combined_odds, payout, possible_win, status, description)
  VALUES ('2024-02-01', 100.00, 2.80, 280.00, 280.00, 'win', 'Big game combo')
  RETURNING id INTO ticket3_id;
  
  INSERT INTO tickets (date, stake, combined_odds, payout, possible_win, status, description)
  VALUES ('2024-02-10', 25.00, 5.00, 0, 125.00, 'loss', 'High odds attempt')
  RETURNING id INTO ticket4_id;
  
  INSERT INTO tickets (date, stake, combined_odds, payout, possible_win, status, description)
  VALUES ('2024-02-15', 75.00, 3.20, 0, 240.00, 'pending', 'Current bet')
  RETURNING id INTO ticket5_id;
  
  -- Create predictions for ticket 1 (win)
  INSERT INTO predictions (ticket_id, user_id, odds, result, sport_id, league_id, tip_date, profit)
  VALUES 
    (ticket1_id, marcel_id, 1.50, 'OK', football_id, premier_league_id, '2024-01-15', 54.17),
    (ticket1_id, peter_id, 1.70, 'OK', basketball_id, nba_id, '2024-01-15', 54.17),
    (ticket1_id, michal_id, 1.67, 'OK', tennis_id, atp_id, '2024-01-15', 54.16);
  
  -- Create predictions for ticket 2 (loss)
  INSERT INTO predictions (ticket_id, user_id, odds, result, sport_id, league_id, tip_date, profit)
  VALUES 
    (ticket2_id, marcel_id, 1.40, 'OK', football_id, premier_league_id, '2024-01-20', 0),
    (ticket2_id, peter_id, 1.80, 'NOK', basketball_id, nba_id, '2024-01-20', -30.00),
    (ticket2_id, michal_id, 1.39, 'OK', tennis_id, atp_id, '2024-01-20', 0);
  
  -- Create predictions for ticket 3 (win)
  INSERT INTO predictions (ticket_id, user_id, odds, result, sport_id, league_id, tip_date, profit)
  VALUES 
    (ticket3_id, marcel_id, 1.30, 'OK', football_id, premier_league_id, '2024-02-01', 60.00),
    (ticket3_id, peter_id, 1.50, 'OK', basketball_id, nba_id, '2024-02-01', 60.00),
    (ticket3_id, michal_id, 1.44, 'OK', tennis_id, atp_id, '2024-02-01', 60.00);
  
  -- Create predictions for ticket 4 (loss)
  INSERT INTO predictions (ticket_id, user_id, odds, result, sport_id, league_id, tip_date, profit)
  VALUES 
    (ticket4_id, marcel_id, 2.00, 'NOK', football_id, premier_league_id, '2024-02-10', -8.33),
    (ticket4_id, peter_id, 1.80, 'OK', basketball_id, nba_id, '2024-02-10', 0),
    (ticket4_id, michal_id, 1.39, 'NOK', tennis_id, atp_id, '2024-02-10', -16.67);
  
  -- Create predictions for ticket 5 (pending)
  INSERT INTO predictions (ticket_id, user_id, odds, result, sport_id, league_id, tip_date)
  VALUES 
    (ticket5_id, marcel_id, 1.60, 'Pending', football_id, premier_league_id, '2024-02-15'),
    (ticket5_id, peter_id, 1.45, 'Pending', basketball_id, nba_id, '2024-02-15'),
    (ticket5_id, michal_id, 1.38, 'Pending', tennis_id, atp_id, '2024-02-15');
  
  -- Create sample finance transactions
  INSERT INTO finance_transactions (type, amount, date, description)
  VALUES 
    ('deposit', 500.00, '2024-01-01', 'Initial deposit'),
    ('bet', -50.00, '2024-01-15', 'Ticket #1'),
    ('payout', 212.50, '2024-01-15', 'Ticket #1 win'),
    ('bet', -30.00, '2024-01-20', 'Ticket #2'),
    ('deposit', 200.00, '2024-01-25', 'Monthly top-up'),
    ('bet', -100.00, '2024-02-01', 'Ticket #3'),
    ('payout', 280.00, '2024-02-01', 'Ticket #3 win'),
    ('bet', -25.00, '2024-02-10', 'Ticket #4'),
    ('bet', -75.00, '2024-02-15', 'Ticket #5'),
    ('withdraw', -100.00, '2024-02-12', 'Partial withdrawal');
END $$;
