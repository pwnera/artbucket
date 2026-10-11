DROP VIEW "public"."catalog_edges";--> statement-breakpoint
CREATE VIEW "public"."catalog_edges" AS (select a.id as from_id, a.superseded_by as to_id, 'replaced_by' as kind, null as via from "assets" a where a.superseded_by is not null
    union all
    select a.parent_asset_id, a.id, 'derived', null from "assets" a where a.parent_asset_id is not null
    union all
    select bra.asset_id, r.brand_id, 'rule', string_agg(distinct r.key, ', ') from "brand_rule_assets" bra join "brand_rules" r on r.id = bra.rule_id group by bra.asset_id, r.brand_id
    union all
    select ca.asset_id, ca.collection_id, 'member', null from "collection_assets" ca
    union all
    select pc.collection_id, pc.portal_id, 'offered', null from "portal_collections" pc
    union all
    select pb.brand_id, pb.portal_id, 'offered', null from "portal_brands" pb
    union all
    select s.id, b.id, 'fork', b.forked_from from "brands" b
      join "organizations" o on o.slug = split_part(b.forked_from, '/', 1)
      join "projects" w on w.organization_id = o.id
      join "brands" s on s.project_id = w.id and s.slug = split_part(split_part(b.forked_from, '/', 2), '@', 1)
    where b.forked_from is not null
    union all
    select (x.value #>> '{}')::uuid, d.site_id, 'built', d.path from "site_deployments" d, jsonb_array_elements(case when jsonb_typeof(d.manifest -> 'assets') = 'array' then d.manifest -> 'assets' else '[]'::jsonb end) x
    where d.state = 'live' and (x.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    union all
    select b.id, d.site_id, 'built', d.path from "site_deployments" d join "portals" p on p.id = d.site_id join "brands" b on b.project_id = p.project_id and b.slug = d.manifest ->> 'brand'
    where d.state = 'live');