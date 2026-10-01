-- Fix: migration 021 used profiles.email which doesn't exist.
-- Join auth.users to set is_admin correctly.
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE u.id = p.id
  AND u.email = 'ahmed99@gmail.com';
