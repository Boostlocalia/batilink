-- The article's own language: the app lists news from sources in the reader's language
-- first and tells them when the link opens an article in another language.
alter table public.news_items add column source_lang text not null default 'fr' check (source_lang in ('fr', 'nl', 'en', 'other'));
