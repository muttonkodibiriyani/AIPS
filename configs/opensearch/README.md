Apply the composed index template to your OpenSearch cluster (Docker compose default):

```bash
curl -X PUT "${OPENSEARCH_URL:-http://localhost:9200}/_index_template/commerce-products-template" \
  -H "Content-Type: application/json" \
  --data-binary @configs/opensearch/commerce-products-index-template.json

curl -X PUT "${OPENSEARCH_URL:-http://localhost:9200}/commerce-products-000001"

curl -X POST "${OPENSEARCH_URL:-http://localhost:9200}/_aliases" \
  -H "Content-Type: application/json" \
  -d "{\"actions\":[{\"add\":{\"alias\":\"commerce-products\",\"index\":\"commerce-products-000001\"}}]}"
```
