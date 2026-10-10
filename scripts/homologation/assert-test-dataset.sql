-- psql include, inside the test transaction, before changing role.
do $$
begin
 if (select count(*) from auth.users)<>6 or (select count(*) from public.profiles)<>6
 or (select count(*) from public.organizations)<>2
 or not exists(select 1 from public.organizations where id='10000000-0000-0000-0000-000000000001' and slug='homologacao-fundacao-a' and status='active')
 or not exists(select 1 from public.organizations where id='10000000-0000-0000-0000-000000000002' and slug='homologacao-fundacao-b' and status='active')
 then raise exception 'expected_dedicated_foundation_test_dataset'; end if;
end $$;
