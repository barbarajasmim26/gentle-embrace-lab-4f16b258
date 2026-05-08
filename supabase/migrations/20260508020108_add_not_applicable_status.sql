-- Add 'not_applicable' status to payments table
ALTER TABLE public.payments DROP CONSTRAINT payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status IN ('paid', 'pending', 'deposit', 'not_applicable'));
